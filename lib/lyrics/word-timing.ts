import type { LyricLine, LyricWord } from "@/lib/song-context/schema";
import { syllables } from "./text";

/**
 * Verteilt die Dauer einer Zeile nach Silben auf ihre Wörter (wenn der Provider
 * nur Zeilen-Timing liefert). Vor Satzzeichen gibt es eine kleine Pause.
 */
export function estimateWords(line: Pick<LyricLine, "startMs" | "endMs" | "text">): LyricWord[] {
  const parts = line.text.split(/\s+/).filter(Boolean);
  if (!parts.length) return [];
  const weights = parts.map((p) => syllables(p) + (/[,.;:!?…]$/.test(p) ? 0.5 : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  const span = Math.max(line.endMs - line.startMs, parts.length * 80);
  let cursor = line.startMs;
  return parts.map((text, i) => {
    const dur = (span * weights[i]!) / total;
    const w = { startMs: Math.round(cursor), endMs: Math.round(cursor + dur * 0.9), text };
    cursor += dur;
    return w;
  });
}

/** Typische Singdauer einer Zeile, falls das Format kein Zeilenende kennt (LRC). */
export function typicalLineDurationMs(text: string): number {
  const syl = text.split(/\s+/).filter(Boolean).reduce((n, w) => n + syllables(w), 0);
  return 600 + syl * 280;
}
