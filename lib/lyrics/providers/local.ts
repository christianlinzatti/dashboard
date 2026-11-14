import { readFile } from "node:fs/promises";
import path from "node:path";
import { lyricsSchema } from "@/lib/song-context/schema";
import { parseLrc } from "../parse-lrc";
import type { LyricsProvider } from "../types";

/**
 * Eigene Korrekturen im Repo: data/lyrics/<spotifyId>.lrc oder .json (Lyrics-Format).
 * Gewinnt immer gegen externe Provider.
 */
export function localOverrides(dir = path.join(process.cwd(), "data", "lyrics")): LyricsProvider {
  return {
    id: "lokal",
    priority: 0,
    authoritative: true,
    async search(q) {
      const id = q.spotifyId?.replace(/[^A-Za-z0-9]/g, "");
      if (!id) return null;
      const json = await readFile(path.join(dir, `${id}.json`), "utf8").catch(() => null);
      if (json) {
        const doc = lyricsSchema.parse(JSON.parse(json));
        const sync = doc.quality === "word" ? "word" : doc.quality === "plain" ? "plain" : "line";
        return { provider: "lokal", sync, lines: doc.lines, singers: doc.singers };
      }
      const lrc = await readFile(path.join(dir, `${id}.lrc`), "utf8").catch(() => null);
      if (!lrc) return null;
      const { lines, hasWords } = parseLrc(lrc, q.durationMs);
      return { provider: "lokal", sync: hasWords ? "word" : "line", lines };
    },
  };
}
