import "server-only";
import type { Lyrics } from "@/lib/song-context/schema";
import { createBreaker } from "./breaker";
import { getCache } from "./cache";
import { findLyrics, toLyrics, type Attempt } from "./chain";
import { localOverrides } from "./providers/local";
import { lrclib } from "./providers/lrclib";
import { musixmatchDesktop } from "./providers/musixmatch";
import { netease } from "./providers/netease";
import { spotifyColor } from "./providers/spotify-color";
import type { LyricsProvider, TrackQuery } from "./types";

const breaker = createBreaker();
const CACHE_VERSION = "v1";
const TTL_FOUND = 30 * 24 * 3600;
const TTL_MISSING = 24 * 3600;

/**
 * Externe Provider, steuerbar über LYRICS_PROVIDERS (kommagetrennt).
 * Standard: alle. Spotify Color-Lyrics nutzt das Anmelde-Token und ggf. SPOTIFY_SP_DC + TOTP-Secret.
 */
export function activeProviders(env: Record<string, string | undefined> = process.env): LyricsProvider[] {
  const all: Record<string, () => LyricsProvider | null> = {
    lrclib: () => lrclib(),
    netease: () => netease(),
    "musixmatch-desktop": () => musixmatchDesktop(),
    // versucht zuerst das Anmelde-Token, sp_dc nur wenn konfiguriert
    "spotify-color": () =>
      spotifyColor({ spDc: env.SPOTIFY_SP_DC, totpSecret: env.SPOTIFY_TOTP_SECRET, totpVersion: env.SPOTIFY_TOTP_VERSION }),
  };
  const wanted = (env.LYRICS_PROVIDERS ?? "musixmatch-desktop,spotify-color,netease,lrclib").split(",").map((x) => x.trim());
  return wanted.flatMap((id) => {
    const p = all[id]?.();
    return p ? [p] : [];
  });
}

export type LyricsResponse = {
  lyrics: Lyrics | null;
  instrumental: boolean;
  cached: boolean;
  attempts: Attempt[];
};

export async function lyricsFor(q: TrackQuery): Promise<LyricsResponse> {
  // Eigene Korrekturen zuerst und ohne Cache – Änderungen wirken sofort nach dem Deployment
  const local = await localOverrides().search(q, AbortSignal.timeout(1000)).catch(() => null);
  if (local?.lines.length) {
    return { lyrics: toLyrics(local, q), instrumental: false, cached: false, attempts: [{ provider: "lokal", outcome: "ok", ms: 0 }] };
  }

  const cache = getCache();
  const key = `lyrics:${CACHE_VERSION}:${q.trackKey}`;
  const hit = await cache.get<Omit<LyricsResponse, "cached">>(key);
  if (hit) return { ...hit, cached: true };

  const r = await findLyrics(q, activeProviders(), { breaker });
  const value = { lyrics: r.lyrics, instrumental: r.instrumental, attempts: r.attempts };
  // Fehler/Timeouts nicht dauerhaft cachen – nur echte Treffer und echtes „nicht vorhanden“
  const transient = !r.lyrics && r.attempts.some((a) => a.outcome === "error" || a.outcome === "timeout");
  if (!transient) await cache.set(key, value, r.lyrics ? TTL_FOUND : TTL_MISSING);
  return { ...value, cached: false };
}
