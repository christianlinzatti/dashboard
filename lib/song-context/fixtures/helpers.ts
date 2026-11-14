import type { LyricLine, Section } from "../schema";

/** Grobe Silbenschätzung (Vokalgruppen) – reicht für Demo-Timings. */
function syllables(word: string) {
  const groups = word.toLowerCase().match(/[aeiouyäöü]+/g);
  return Math.max(groups?.length ?? 1, 1);
}

/**
 * Baut eine Lyric-Zeile mit Wort-Timings: Zeilendauer wird nach Silben verteilt.
 * Nur für Demo-/Test-Daten; echte Wort-Timings liefern die Provider.
 */
export function line(startS: number, endS: number, text: string, agent?: string, withWords = true): LyricLine {
  const startMs = Math.round(startS * 1000);
  const endMs = Math.round(endS * 1000);
  const parts = text.split(/\s+/).filter(Boolean);
  const weights = parts.map(syllables);
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = startMs;
  const words = parts.map((p, i) => {
    const dur = ((endMs - startMs) * weights[i]!) / total;
    const w = { startMs: Math.round(cursor), endMs: Math.round(cursor + dur * 0.92), text: p };
    cursor += dur;
    return w;
  });
  return { startMs, endMs, text, ...(agent ? { agent } : {}), ...(withWords ? { words } : {}) };
}

export function section(kind: Section["kind"], startS: number, endS: number): Section {
  return { kind, startMs: startS * 1000, endMs: endS * 1000 };
}
