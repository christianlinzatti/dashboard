import "server-only";
import { CACHE_TTL } from "@/lib/cache-policy";
import { randomUUID } from "node:crypto";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import type { Command, CommandInput, Snapshot } from "@/lib/song-context/snapshot";

const SNAPSHOT_TTL = CACHE_TTL.snapshot;
const COMMAND_TTL = CACHE_TTL.commands;
const MAX_COMMANDS = 20;

/** Warteschlange je Nutzer; `remoteUntil`: so lange ist eine Fernbedienung offen – der Kiosk fragt dann alle 2 s */
type Queue = { list: Command[]; remoteUntil?: number };
/** So lange hält ein Lebenszeichen der Fernbedienung den schnellen Abruf an */
export const REMOTE_ALIVE_MS = 90_000;

/**
 * Serverseitiger Live-Stand pro Spotify-Nutzer: Schnappschuss des Song-Kontexts und Befehlswarteschlange.
 * Mit Upstash über alle Serverless-Instanzen geteilt, sonst nur im Speicher der Instanz.
 */
export function createLiveStore(cache: Cache = getCache()) {
  const snapKey = (uid: string) => `now:v1:${uid}`;
  const cmdKey = (uid: string) => `cmd:v2:${uid}`;
  const read = async (uid: string): Promise<Queue> => (await cache.get<Queue>(cmdKey(uid))) ?? { list: [] };
  return {
    saveSnapshot: (uid: string, s: Snapshot) => cache.set(snapKey(uid), s, SNAPSHOT_TTL),
    getSnapshot: (uid: string) => cache.get<Snapshot>(snapKey(uid)),
    /** Befehl einreihen; `remote`: kommt von der Fernbedienung (hält den schnellen Abruf an) */
    async pushCommand(uid: string, c: CommandInput, opts: { remote?: boolean } = {}) {
      const q = await read(uid);
      const cmd: Command = { ...c, id: randomUUID(), createdAt: Date.now() };
      const remoteUntil = opts.remote ? Date.now() + REMOTE_ALIVE_MS : q.remoteUntil;
      await cache.set(cmdKey(uid), { list: [...q.list, cmd].slice(-MAX_COMMANDS), remoteUntil }, COMMAND_TTL);
      return cmd;
    },
    /** Lebenszeichen der Fernbedienung (Seite offen) */
    async markRemote(uid: string) {
      const q = await read(uid);
      await cache.set(cmdKey(uid), { ...q, remoteUntil: Date.now() + REMOTE_ALIVE_MS }, COMMAND_TTL);
    },
    /** Holt alle offenen Befehle ab (und leert die Warteschlange); `remote`: Fernbedienung offen → schnell weiterfragen */
    async takeCommands(uid: string): Promise<{ commands: Command[]; remote: boolean }> {
      const q = await read(uid);
      if (q.list.length) await cache.set(cmdKey(uid), { ...q, list: [] }, COMMAND_TTL);
      return {
        commands: q.list.filter((c) => Date.now() - c.createdAt < COMMAND_TTL * 1000),
        remote: (q.remoteUntil ?? 0) > Date.now(),
      };
    },
  };
}

let shared: ReturnType<typeof createLiveStore> | undefined;
export const liveStore = () => (shared ??= createLiveStore());
