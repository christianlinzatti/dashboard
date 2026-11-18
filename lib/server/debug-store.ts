import "server-only";
import { CACHE_TTL } from "@/lib/cache-policy";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import type { DebugEntry } from "@/lib/live/debug-upload";

/** Zuletzt gesendeter Song-Kontext je Spotify-Nutzer (eine Stunde; mit Upstash geräteübergreifend). */
export function createDebugStore(cache: Cache = getCache()) {
  const key = (uid: string) => `dbg:v1:${uid}`;
  return {
    save: (uid: string, e: DebugEntry) => cache.set(key(uid), e, CACHE_TTL.debugContext),
    get: (uid: string) => cache.get<DebugEntry>(key(uid)),
  };
}

let shared: ReturnType<typeof createDebugStore> | undefined;
export const debugStore = () => (shared ??= createDebugStore());
