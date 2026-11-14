import { z } from "zod";
import type { LyricLine, LyricWord } from "@/lib/song-context/schema";
import { isSameTrack } from "../match";
import { parseLrc } from "../parse-lrc";
import { cleanTitle } from "../text";
import type { LyricsProvider } from "../types";

const BASE = "https://music.163.com/api";
const HEADERS = { Referer: "https://music.163.com", "User-Agent": "Mozilla/5.0 (X11; Linux x86_64)" };

const searchSchema = z.object({
  result: z
    .object({
      songs: z
        .array(
          z.object({
            id: z.number(),
            name: z.string(),
            duration: z.number().optional(),
            artists: z.array(z.object({ name: z.string() })),
          }),
        )
        .optional(),
    })
    .optional(),
});
const lyricSchema = z.object({
  lrc: z.object({ lyric: z.string().nullable().optional() }).optional(),
  yrc: z.object({ lyric: z.string().nullable().optional() }).optional(),
});

const LINE = /^\[(\d+),(\d+)\](.*)$/;
const WORD = /\((\d+),(\d+),-?\d+\)([^(]*)/g;

/** NetEase-YRC: `[Zeilenstart,Dauer](Wortstart,Wortdauer,0)Wort …` – absolute Millisekunden. */
export function parseYrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(LINE);
    if (!m) continue; // JSON-Metadaten (Credits) überspringen
    const start = Number(m[1]);
    const dur = Number(m[2]);
    const words: LyricWord[] = [];
    for (const w of m[3]!.matchAll(WORD)) {
      const text = w[3]!.trim();
      if (text) words.push({ startMs: Number(w[1]), endMs: Number(w[1]) + Number(w[2]), text });
    }
    if (!words.length) continue;
    lines.push({ startMs: start, endMs: start + dur, text: words.map((w) => w.text).join(" "), words });
  }
  return lines;
}

/** Zeilen, die nur Credits sind („作词 : …“, „Composer: …“). */
const CREDIT = /^(作词|作曲|编曲|制作|composer|lyricist|producer|written by)\s*[:：]/i;

/** NetEase Cloud Music (inoffiziell): Wort-Sync (YRC) für viele internationale Titel. */
export function netease(fetchImpl: typeof fetch = fetch): LyricsProvider {
  const get = async (url: string, signal: AbortSignal) => {
    const res = await fetchImpl(url, { headers: HEADERS, signal });
    if (!res.ok) throw new Error(`NetEase ${res.status}`);
    return res.json();
  };
  return {
    id: "netease",
    priority: 30,
    async search(q, signal) {
      const s = new URLSearchParams({ s: `${cleanTitle(q.title)} ${q.artists[0] ?? ""}`, type: "1", limit: "8" });
      const found = searchSchema.safeParse(await get(`${BASE}/search/get?${s}`, signal));
      const songs = found.success ? (found.data.result?.songs ?? []) : [];
      const hit = songs.find((x) =>
        isSameTrack(q, { title: x.name, artists: x.artists.map((a) => a.name), durationMs: x.duration }),
      );
      if (!hit) return null;

      const ly = lyricSchema.safeParse(await get(`${BASE}/song/lyric/v1?id=${hit.id}&lv=1&yv=1&tv=-1&kv=1`, signal));
      if (!ly.success) return null;
      const yrc = ly.data.yrc?.lyric ? parseYrc(ly.data.yrc.lyric).filter((l) => !CREDIT.test(l.text)) : [];
      if (yrc.length >= 3) return { provider: "netease", sync: "word", lines: yrc, durationMs: hit.duration };
      const lrc = ly.data.lrc?.lyric ? parseLrc(ly.data.lrc.lyric, q.durationMs).lines.filter((l) => !CREDIT.test(l.text)) : [];
      return lrc.length >= 3 ? { provider: "netease", sync: "line", lines: lrc, durationMs: hit.duration } : null;
    },
  };
}
