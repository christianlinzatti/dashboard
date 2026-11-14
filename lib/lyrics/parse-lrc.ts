import type { LyricLine, LyricWord } from "@/lib/song-context/schema";
import { typicalLineDurationMs } from "./word-timing";

const TIME = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)>/g;

function toMs(min: string, sec: string) {
  const [s, frac = "0"] = sec.split(/[.:]/);
  const ms = frac.length === 1 ? Number(frac) * 100 : frac.length === 2 ? Number(frac) * 10 : Number(frac.slice(0, 3));
  return Number(min) * 60_000 + Number(s) * 1000 + ms;
}

export type ParsedLrc = { lines: LyricLine[]; hasWords: boolean };

/**
 * Liest LRC und Enhanced-LRC (Wort-Tags `<mm:ss.xx>`).
 * - mehrere Zeitstempel pro Zeile (`[00:12.00][01:30.00]Refrain`)
 * - `[offset:+/-ms]` (positiv = Lyrics früher)
 * - leere Zeilen beenden die vorherige Zeile (Instrumental-Pause)
 */
export function parseLrc(input: string, durationMs?: number): ParsedLrc {
  let offset = 0;
  const raw: Array<{ t: number; text: string; words?: LyricWord[] }> = [];

  for (const rawLine of input.split(/\r?\n/)) {
    const meta = rawLine.match(/^\[(\w+):\s*([^\]]*)\]\s*$/);
    if (meta && !/^\d+$/.test(meta[1]!)) {
      if (meta[1]!.toLowerCase() === "offset") offset = Number(meta[2]) || 0;
      continue;
    }
    const stamps = [...rawLine.matchAll(TIME)];
    if (!stamps.length) continue;
    const rest = rawLine.replace(TIME, "");

    // Wort-Tags (Enhanced LRC)
    const tags = [...rest.matchAll(WORD_TAG)];
    let words: LyricWord[] | undefined;
    let text: string;
    if (tags.length) {
      words = [];
      for (let i = 0; i < tags.length; i++) {
        const tag = tags[i]!;
        const start = tag.index! + tag[0].length;
        const end = tags[i + 1]?.index ?? rest.length;
        const w = rest.slice(start, end).trim();
        const t = toMs(tag[1]!, tag[2]!);
        const next = tags[i + 1];
        if (w) words.push({ startMs: t, endMs: next ? toMs(next[1]!, next[2]!) : t, text: w });
      }
      text = words.map((w) => w.text).join(" ");
    } else {
      text = rest.trim();
    }

    for (const s of stamps) raw.push({ t: toMs(s[1]!, s[2]!), text, words });
  }

  raw.sort((a, b) => a.t - b.t);
  const shift = (ms: number) => Math.max(0, ms - offset);

  const lines: LyricLine[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i]!;
    if (!r.text) continue; // Leerzeile = Ende der vorherigen
    const next = raw[i + 1];
    const nextStart = next?.t ?? durationMs ?? r.t + typicalLineDurationMs(r.text);
    const lastWordEnd = r.words?.at(-1)?.endMs;
    // Explizite Leerzeile = exaktes Ende; sonst typische Singdauer, höchstens bis zur nächsten Zeile
    const endRaw =
      lastWordEnd && lastWordEnd > r.t
        ? Math.min(lastWordEnd, nextStart)
        : next && !next.text
          ? next.t
          : Math.min(nextStart, r.t + typicalLineDurationMs(r.text) * 1.6);
    const startMs = shift(r.t);
    const endMs = Math.max(shift(endRaw), startMs + 200);

    let words = r.words?.map((w, j, arr) => {
      // letztes Wort ohne End-Tag: bis Zeilenende
      const end = j === arr.length - 1 && w.endMs <= w.startMs ? endRaw : w.endMs;
      return { startMs: shift(w.startMs), endMs: Math.max(shift(end), shift(w.startMs) + 50), text: w.text };
    });
    // Mehrfach-Zeitstempel: Wort-Timings auf die jeweilige Wiederholung verschieben
    if (words?.length && words[0]!.startMs !== startMs) {
      const delta = startMs - words[0]!.startMs;
      if (Math.abs(delta) > 1000) words = words.map((w) => ({ ...w, startMs: w.startMs + delta, endMs: w.endMs + delta }));
    }
    lines.push({ startMs, endMs, text: r.text, ...(words?.length ? { words } : {}) });
  }

  return { lines, hasWords: lines.some((l) => l.words?.length) };
}
