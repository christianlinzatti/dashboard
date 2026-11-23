import type { Choreography } from "@/lib/dance/plan";
import { grid } from "./musicians";

/**
 * Groove über dem Tanz: kleine Bewegungen, die jede Figur zusätzlich zu ihrem Clip im Songtakt macht – zustandslos aus
 * Songzeit und Choreografie (gleiche Zeit → gleiche Pose).
 *
 * - squash: federt auf jedem Schlag kurz ein (Höhe −, Breite +, Volumen bleibt), Comic-Prinzip „Squash & Stretch“
 * - nod: Kopf nickt im Takt nach vorn (Rad)
 * - sway: Oberkörper wiegt über zwei Schläge von Seite zu Seite (Rad, Vorzeichen = Richtung)
 *
 * Stärke nach der Energie der Phrase (ruhige Strophe sanft, Refrain kräftig). Chibis (großer Kopf, kurzer Körper)
 * bewegen sich deutlich stärker – das trägt den Stil.
 */
export type Groove = { squash: number; nod: number; sway: number };

export const NO_GROOVE: Groove = { squash: 0, nod: 0, sway: 0 };

/** Ausschlag je Figurenart (bei voller Energie) */
export const GROOVE_AMOUNT = {
  normal: { squash: 0.025, nod: 0.12, sway: 0.06 },
  chibi: { squash: 0.07, nod: 0.22, sway: 0.1 },
} as const;

/** Energie 0..3 → Anteil des vollen Ausschlags */
const LEVEL = [0.25, 0.55, 0.8, 1] as const;

export function grooveAt(
  c: Choreography,
  t: number,
  opts: { anchorMs?: number | null; chibi?: boolean; mirror?: boolean } = {},
): Groove {
  const { since, phrase, beats } = grid(c, t, opts.anchorMs ?? null);
  if (!phrase) return NO_GROOVE;
  const level = Math.min(1, (LEVEL[phrase.energy] ?? 1) * (phrase.section === "chorus" ? 1.15 : 1));
  const a = GROOVE_AMOUNT[opts.chibi ? "chibi" : "normal"];
  const u = Math.min(Math.max(since / c.beatMs, 0), 1);
  return {
    // scharf auf dem Schlag, federt bis zum nächsten zurück
    squash: (1 - u) ** 2 * level * a.squash,
    nod: Math.sin(Math.PI * u) * level * a.nod,
    // eine volle Wiege-Bewegung dauert zwei Schläge; Nachbarn wiegen gespiegelt
    sway: Math.sin(Math.PI * beats) * level * a.sway * (opts.mirror ? -1 : 1),
  };
}
