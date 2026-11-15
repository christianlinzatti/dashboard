import "server-only";
import { CACHE_TTL } from "@/lib/cache-policy";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import { deezerBpm } from "./deezer";

export function createTempoService(deps: { cache: Cache; fetch?: typeof fetch }) {
  /** Tempo-Startwert je ISRC (gecacht; „unbekannt“ kürzer, Fehler gar nicht). */
  return async function tempoFor(isrc: string, durationMs?: number): Promise<{ bpm: number | null; source: "deezer" }> {
    const key = `tempo:v1:${isrc}`;
    const hit = await deps.cache.get<{ bpm: number | null }>(key);
    if (hit) return { bpm: hit.bpm, source: "deezer" };
    const bpm = await deezerBpm(isrc, durationMs, deps.fetch, AbortSignal.timeout(4000));
    await deps.cache.set(key, { bpm }, bpm ? CACHE_TTL.tempoFound : CACHE_TTL.tempoMissing);
    return { bpm, source: "deezer" };
  };
}

let shared: ReturnType<typeof createTempoService> | undefined;
export function tempoFor(isrc: string, durationMs?: number) {
  shared ??= createTempoService({ cache: getCache() });
  return shared(isrc, durationMs);
}
