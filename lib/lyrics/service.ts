import "server-only";
import { createHash } from "node:crypto";
import type { Lyrics } from "@/lib/song-context/schema";
import { createBreaker, type Breaker } from "./breaker";
import { getCache, type Cache } from "./cache";
import { findLyrics, toLyrics, type Attempt } from "./chain";
import { localOverrides } from "./providers/local";
import { lrclib } from "./providers/lrclib";
import { musixmatchDesktop } from "./providers/musixmatch";
import { netease } from "./providers/netease";
import { spotifyColor } from "./providers/spotify-color";
import type { LyricsProvider, TrackQuery } from "./types";

const CACHE_VERSION = "v2";
const TTL_FOUND = 30 * 24 * 3600;
const TTL_MISSING = 24 * 3600;
export const DEFAULT_PROVIDERS = "musixmatch-desktop,spotify-color,netease,lrclib";

/**
 * Externe Provider, steuerbar über LYRICS_PROVIDERS (kommagetrennt).
 * Spotify Color-Lyrics nutzt das Anmelde-Token und ggf. SPOTIFY_SP_DC + TOTP-Secret.
 */
export function activeProviders(env: Record<string, string | undefined> = process.env): LyricsProvider[] {
  const all: Record<string, () => LyricsProvider | null> = {
    lrclib: () => lrclib(),
    netease: () => netease(),
    "musixmatch-desktop": () => musixmatchDesktop(),
    "spotify-color": () =>
      spotifyColor({ spDc: env.SPOTIFY_SP_DC, totpSecret: env.SPOTIFY_TOTP_SECRET, totpVersion: env.SPOTIFY_TOTP_VERSION }),
  };
  const wanted = (env.LYRICS_PROVIDERS ?? DEFAULT_PROVIDERS).split(",").map((x) => x.trim());
  return wanted.flatMap((id) => {
    const p = all[id]?.();
    return p ? [p] : [];
  });
}

/**
 * Cache-Schlüssel enthält die Provider-Konfiguration: Kommt ein Provider hinzu
 * (z. B. sp_dc gesetzt), werden alte „nicht gefunden“-Einträge nicht weiterverwendet.
 */
export function cacheKey(trackKey: string, providers: LyricsProvider[], spDcConfigured: boolean) {
  const config = createHash("sha1")
    .update(providers.map((p) => p.id).join(",") + (spDcConfigured ? "+spdc" : ""))
    .digest("hex")
    .slice(0, 8);
  return `lyrics:${CACHE_VERSION}:${config}:${trackKey}`;
}

export type LyricsResponse = {
  lyrics: Lyrics | null;
  instrumental: boolean;
  cached: boolean;
  attempts: Attempt[];
};

type Deps = { providers: LyricsProvider[]; cache: Cache; local: LyricsProvider; breaker: Breaker; spDcConfigured: boolean };

export function createLyricsService(deps: Deps) {
  return async function lyricsFor(q: TrackQuery): Promise<LyricsResponse> {
    // Eigene Korrekturen zuerst und ohne Cache – Änderungen wirken sofort nach dem Deployment
    const local = await deps.local.search(q, AbortSignal.timeout(1000)).catch(() => null);
    if (local?.lines.length) {
      return {
        lyrics: toLyrics(local, q),
        instrumental: false,
        cached: false,
        attempts: [{ provider: "lokal", outcome: "ok", ms: 0 }],
      };
    }

    const key = cacheKey(q.trackKey, deps.providers, deps.spDcConfigured);
    const hit = await deps.cache.get<Omit<LyricsResponse, "cached">>(key);
    if (hit) return { ...hit, cached: true };

    const r = await findLyrics(q, deps.providers, { breaker: deps.breaker });
    const value = { lyrics: r.lyrics, instrumental: r.instrumental, attempts: r.attempts };
    // Fehler/Timeouts nicht dauerhaft cachen – nur echte Treffer und echtes „nicht vorhanden“
    const transient = !r.lyrics && r.attempts.some((a) => a.outcome === "error" || a.outcome === "timeout");
    if (!transient) await deps.cache.set(key, value, r.lyrics ? TTL_FOUND : TTL_MISSING);
    return { ...value, cached: false };
  };
}

let shared: ReturnType<typeof createLyricsService> | undefined;

/** Lyrics für einen Song (Standard-Instanz mit Umgebungs-Konfiguration). */
export function lyricsFor(q: TrackQuery) {
  shared ??= createLyricsService({
    providers: activeProviders(),
    cache: getCache(),
    local: localOverrides(),
    breaker: createBreaker(),
    spDcConfigured: !!process.env.SPOTIFY_SP_DC,
  });
  return shared(q);
}
