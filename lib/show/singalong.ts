import type { Phrase } from "@/lib/dance/plan";
import type { Lyrics } from "@/lib/song-context/schema";
import { SLOWMO_BARS, type Climax } from "@/lib/stage/climax";

/**
 * Mitsing-Moment: Im letzten Refrain hält der Sänger das Mikrofon ins Publikum und die Menge singt allein – nach
 * Zeitlupe und Kameraflug, für vier Takte. Nur bei Songs mit Gesang an dieser Stelle (sonst gäbe es nichts zu
 * singen). Reine Funktion der Choreografie: gleiche Songzeit, gleiches Bild.
 */
export type SingAlong = { startMs: number; endMs: number };

/** Länge des Moments in Takten */
export const SINGALONG_BARS = 4;

export function planSingAlong(
  phrases: readonly Pick<Phrase, "startMs" | "endMs" | "section">[],
  climaxes: readonly Climax[],
  barMs: number,
  lyrics: Pick<Lyrics, "lines"> | null | undefined,
): SingAlong | null {
  const finale = climaxes.find((c) => c.finale);
  if (!finale || !lyrics?.lines.length) return null;
  // Ende des Refrains: so weit, wie die Refrain-Phrasen ohne Unterbrechung reichen
  let chorusEnd = finale.atMs;
  for (const p of phrases) {
    if (p.endMs <= finale.atMs) continue;
    if (p.section !== "chorus") break;
    chorusEnd = p.endMs;
  }
  const startMs = finale.atMs + SLOWMO_BARS * barMs;
  const endMs = Math.min(startMs + SINGALONG_BARS * barMs, chorusEnd);
  if (endMs - startMs < 2 * barMs) return null;
  const sung = lyrics.lines.some((l) => l.endMs > startMs && l.startMs < endMs);
  return sung ? { startMs, endMs } : null;
}

/** Stärke zur Songzeit t: 0..1, weich über einen Schlag ein- und ausgeblendet */
export function singAlongAt(s: SingAlong | null | undefined, t: number, beatMs: number): number {
  if (!s || t <= s.startMs || t >= s.endMs) return 0;
  return Math.min(1, (t - s.startMs) / beatMs, (s.endMs - t) / beatMs);
}
