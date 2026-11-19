import "server-only";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import type { LogEntry } from "@/lib/live/log-schema";

const MAX = 100;
const TTL = 7 * 24 * 3600;
const MAX_AGE_MS = TTL * 1000;

/**
 * Kiosk-Protokoll pro Nutzer: die letzten 100 Einträge, keiner älter als 7 Tage (ältere fallen beim Lesen und
 * Schreiben weg). `clear` leert es (Knopf „Leeren“ im Debug-Panel und unter /debug).
 */
export function createLogStore(cache: Cache = getCache(), now: () => number = Date.now) {
  const key = (uid: string) => `log:v1:${uid}`;
  const fresh = (list: LogEntry[]) => {
    const since = now() - MAX_AGE_MS;
    return list.filter((e) => e.at >= since);
  };
  return {
    async append(uid: string, entries: LogEntry[]) {
      const list = fresh((await cache.get<LogEntry[]>(key(uid))) ?? []);
      await cache.set(key(uid), [...list, ...entries].slice(-MAX), TTL);
    },
    list: async (uid: string) => fresh((await cache.get<LogEntry[]>(key(uid))) ?? []),
    clear: (uid: string) => cache.set(key(uid), [], TTL),
  };
}

let shared: ReturnType<typeof createLogStore> | undefined;
export const logStore = () => (shared ??= createLogStore());
