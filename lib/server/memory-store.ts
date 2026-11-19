import "server-only";
import { CACHE_TTL } from "@/lib/cache-policy";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import { memorySchema, mergeObservation, type Observation, type SongMemory } from "@/lib/song-memory/memory";

/** Song-Gedächtnis pro Spotify-Konto (die Messung hängt an Raum und Lautsprecher) und Song. */
export function createMemoryStore(cache: Cache = getCache()) {
  const key = (uid: string, trackKey: string) => `mem:v1:${uid}:${trackKey}`;
  const get = async (uid: string, trackKey: string): Promise<SongMemory | null> => {
    const p = memorySchema.safeParse(await cache.get<unknown>(key(uid, trackKey)));
    return p.success ? p.data : null;
  };
  return {
    get,
    async add(uid: string, obs: Observation): Promise<SongMemory> {
      const next = mergeObservation(await get(uid, obs.trackKey), obs);
      await cache.set(key(uid, obs.trackKey), next, CACHE_TTL.songMemory);
      return next;
    },
  };
}

let shared: ReturnType<typeof createMemoryStore> | undefined;
export const memoryStore = () => (shared ??= createMemoryStore());
