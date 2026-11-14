import "server-only";
import type { Lyrics } from "@/lib/song-context/schema";
import { createBreaker } from "./breaker";
import { getCache } from "./cache";
import { findLyrics, toLyrics, type Attempt } from "./chain";
import { localOverrides } from "./providers/local";
import { lrclib } from "./providers/lrclib";
import type { LyricsProvider, TrackQuery } from "./types";

const breaker = createBreaker();
const CACHE_VERSION = "v1";
const TTL_FOUND = 30 * 24 * 3600;
const TTL_MISSING = 24 * 3600;

/** Externe Provider, steuerbar über LYRICS_PROVIDERS (kommagetrennt). Weitere folgen in Meilenstein 6. */
export function activeProviders(): LyricsProvider[] {
  const all: Record<string, () => LyricsProvider> = { lrclib: () => lrclib() };
  const wanted = (process.env.LYRICS_PROVIDERS ?? "lrclib")
    .split(",")
    .map((s) => s.trim())
    .filter((id) => id in all);
  return wanted.map((id) => all[id]!());
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
