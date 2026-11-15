import "server-only";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import type { LogEntry } from "@/lib/live/log-schema";

const MAX = 100;
const TTL = 7 * 24 * 3600;

/** Kiosk-Protokoll pro Nutzer: die letzten 100 Einträge, 7 Tage. */
export function createLogStore(cache: Cache = getCache()) {
  const key = (uid: string) => `log:v1:${uid}`;
  return {
    async append(uid: string, entries: LogEntry[]) {
      const list = (await cache.get<LogEntry[]>(key(uid))) ?? [];
      await cache.set(key(uid), [...list, ...entries].slice(-MAX), TTL);
    },
    list: async (uid: string) => (await cache.get<LogEntry[]>(key(uid))) ?? [],
  };
}

let shared: ReturnType<typeof createLogStore> | undefined;
export const logStore = () => (shared ??= createLogStore());
