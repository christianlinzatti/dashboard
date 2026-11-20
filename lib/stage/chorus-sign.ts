import type { LyricLine } from "@/lib/song-context/schema";

/**
 * Leuchtschrift im Refrain: Die gerade gesungene Refrain-Zeile schwebt groß über der Bühne. Die Wörter leuchten erst
 * auf, wenn sie gesungen werden (an ihrem festen Platz, die Zeile steht also nicht still neu gesetzt), das jüngste
 * springt kurz auf. Alles rein aus der Lyrics-Zeit – gleiche Zeit, gleiches Bild (Screenshots, angehaltene Demos).
 */

/** Längere Zeilen passen nicht lesbar über die Bühne – dann bleibt es beim Schlagwort auf der Wand */
export const MAX_SIGN_CHARS = 42;
/** Ein- und Ausblenden (ms) */
export const SIGN_FADE_IN_MS = 180;
export const SIGN_FADE_OUT_MS = 450;
/** So lange springt ein neues Wort auf (ms) */
export const WORD_POP_MS = 220;

export type SignWord = { text: string; startMs: number };
export type SignState = {
  /** Zeile (Index in den Lyrics) – ändert sich der Index, wird die Schrift neu gesetzt */
  lineIdx: number;
  words: SignWord[];
  /** so viele Wörter leuchten schon */
  lit: number;
  /** Deckkraft 0..1 */
  amount: number;
  /** Aufspringen des jüngsten Worts 0..1 */
  pop: number;
};

/** Wörter der Zeile mit Einsatzzeit: mit Wort-Timing genau, sonst gleichmäßig über die Zeile verteilt */
export function signWords(line: Pick<LyricLine, "startMs" | "endMs" | "text" | "words">): SignWord[] {
  const timed = line.words?.filter((w) => w.text.trim());
  if (timed?.length) return timed.map((w) => ({ text: w.text.trim(), startMs: w.startMs }));
  const parts = line.text.split(/\s+/).filter(Boolean);
  const span = Math.max(line.endMs - line.startMs, 1);
  // die Wörter kommen in der ersten 80 % der Zeile – zum Schluss wird oft noch gehalten
  return parts.map((text, i) => ({ text, startMs: line.startMs + (span * 0.8 * i) / parts.length }));
}

/**
 * Was die Leuchtschrift zur Lyrics-Zeit t zeigt; null außerhalb des Refrains, bei zu langen Zeilen und bei Zeilen ohne
 * Text. Nach dem Zeilenende blendet sie noch aus (auch wenn der Refrain gerade endet).
 */
export function signAt(
  lines: readonly LyricLine[],
  lineIdx: number,
  t: number,
  inChorus: (ms: number) => boolean,
): SignState | null {
  const line = lines[lineIdx];
  if (!line || t < line.startMs || !inChorus(line.startMs)) return null;
  const text = line.text.trim();
  if (!text || text.length > MAX_SIGN_CHARS) return null;
  const fadeIn = Math.min(1, (t - line.startMs) / SIGN_FADE_IN_MS);
  // ausblenden nach dem Ende, spätestens wenn die nächste Zeile beginnt
  const next = lines[lineIdx + 1]?.startMs ?? Infinity;
  const end = Math.min(line.endMs, next - SIGN_FADE_OUT_MS);
  const fadeOut = t <= end ? 1 : 1 - (t - end) / SIGN_FADE_OUT_MS;
  const amount = Math.max(0, Math.min(fadeIn, fadeOut));
  if (amount <= 0) return null;
  const words = signWords(line);
  let lit = 0;
  while (lit < words.length && words[lit]!.startMs <= t) lit++;
  const since = lit ? t - words[lit - 1]!.startMs : Infinity;
  const pop = since < WORD_POP_MS ? 1 - since / WORD_POP_MS : 0;
  return { lineIdx, words, lit: Math.max(lit, 1), amount, pop };
}

/** Oberhalb davon (Bildschirmhöhe −1..1) stehen Titel, Plaketten und Abschnitt – dort keine Leuchtschrift */
export const HUD_TOP_NDC = 0.62;
const HUD_FADE_NDC = 0.15;

/** 1 = Schrift frei sichtbar, 0 = sie läge in der oberen Leiste (weiche Blende dazwischen) */
export function hudClearance(ndcY: number): number {
  return Math.max(0, Math.min(1, (HUD_TOP_NDC - ndcY) / HUD_FADE_NDC));
}
