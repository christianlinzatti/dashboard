import "server-only";
import { randomUUID } from "node:crypto";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import type { Command, CommandInput, Snapshot } from "@/lib/song-context/snapshot";

const SNAPSHOT_TTL = 2 * 3600;
const COMMAND_TTL = 5 * 60; // nicht abgeholte Befehle verfallen nach 5 min
const MAX_COMMANDS = 20;

/**
 * Serverseitiger Live-Stand pro Spotify-Nutzer: Schnappschuss des Song-Kontexts und Befehlswarteschlange.
 * Mit Upstash über alle Serverless-Instanzen geteilt, sonst nur im Speicher der Instanz.
 */
export function createLiveStore(cache: Cache = getCache()) {
  const snapKey = (uid: string) => `now:v1:${uid}`;
  const cmdKey = (uid: string) => `cmd:v1:${uid}`;
  return {
    saveSnapshot: (uid: string, s: Snapshot) => cache.set(snapKey(uid), s, SNAPSHOT_TTL),
    getSnapshot: (uid: string) => cache.get<Snapshot>(snapKey(uid)),
    async pushCommand(uid: string, c: CommandInput) {
      const list = (await cache.get<Command[]>(cmdKey(uid))) ?? [];
      const cmd: Command = { ...c, id: randomUUID(), createdAt: Date.now() };
      await cache.set(cmdKey(uid), [...list, cmd].slice(-MAX_COMMANDS), COMMAND_TTL);
      return cmd;
    },
    /** Holt alle offenen Befehle ab (und leert die Warteschlange). */
    async takeCommands(uid: string): Promise<Command[]> {
      const list = (await cache.get<Command[]>(cmdKey(uid))) ?? [];
      if (list.length) await cache.set(cmdKey(uid), [], COMMAND_TTL);
      return list.filter((c) => Date.now() - c.createdAt < COMMAND_TTL * 1000);
    },
  };
}

let shared: ReturnType<typeof createLiveStore> | undefined;
export const liveStore = () => (shared ??= createLiveStore());
