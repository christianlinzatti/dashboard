import type { Phrase } from "@/lib/dance/plan";

/**
 * Höhepunkte einer Show: Einsatz eines Refrains (oder eines energiegeladenen Instrumentals). Der erste und das
 * Finale (letzter Refrain) werden groß inszeniert: einen Takt vorher Blackout mit Countdown 4-3-2-1 auf der Wand,
 * beim Einsatz alle Effekte, Blitz, Lauflicht über die Lampen; im Finale Zeitlupe und Kameraflug übers Publikum.
 * Reine Funktion der Phrasen – gleiche Songzeit, gleiches Bild.
 */
export type Climax = {
  atMs: number;
  /** letzter Refrain: Zeitlupe und Kameraflug */
  finale: boolean;
  /** Blackout + Countdown einen Takt vorher */
  countdown: boolean;
};

export type ClimaxState = {
  phase: "blackout" | "hit";
  /** 4, 3, 2, 1 während des Blackouts */
  countdown: number | null;
  finale: boolean;
  /** großer Höhepunkt (mit Countdown): Lauflicht über die Lampen beim Einsatz */
  big: boolean;
  /** 0..1 innerhalb der Phase */
  progress: number;
  /** Schläge seit Phasenbeginn */
  beats: number;
} | null;

export function planClimaxes(phrases: readonly Phrase[], barMs: number): Climax[] {
  const starts = phrases.filter(
    (p, i) =>
      i > 0 &&
      phrases[i - 1]!.section !== p.section &&
      (p.section === "chorus" || (p.section === "instrumental" && p.energy >= 3)) &&
      p.startMs >= 2 * barMs,
  );
  if (!starts.length) return [];
  // Finale: letzter Refrain – ohne Refrain der letzte energiegeladene Abschnitt
  const finale = starts.filter((p) => p.section === "chorus").at(-1) ?? starts.at(-1)!;
  return starts.map((p, i) => ({
    atMs: p.startMs,
    finale: p === finale,
    countdown: i === 0 || p === finale,
  }));
}

/** Zustand zur Songzeit t: Blackout (ein Takt vor einem Countdown-Höhepunkt) oder Einschlag (ein Takt danach). */
export function climaxAt(climaxes: readonly Climax[], t: number, barMs: number): ClimaxState {
  const beatMs = barMs / 4;
  for (const c of climaxes) {
    if (c.countdown && t >= c.atMs - barMs && t < c.atMs) {
      const since = t - (c.atMs - barMs);
      return {
        phase: "blackout",
        countdown: 4 - Math.min(3, Math.floor(since / beatMs)),
        finale: c.finale,
        big: true,
        progress: since / barMs,
        beats: since / beatMs,
      };
    }
    if (t >= c.atMs && t < c.atMs + barMs) {
      const since = t - c.atMs;
      return {
        phase: "hit",
        countdown: null,
        finale: c.finale,
        big: c.countdown,
        progress: since / barMs,
        beats: since / beatMs,
      };
    }
  }
  return null;
}

/** Länge der Zeitlupe im Finale */
export const SLOWMO_BARS = 2;
/** Stärke der Zeitlupe: Tempo sinkt beim Einsatz auf (1 − k) und holt danach auf (1 + k) */
const SLOWMO_K = 0.6;

/**
 * Tanz-Zeit im Finale: erst langsamer, dann schneller – nach zwei Takten wieder genau im Takt.
 * Außerhalb unverändert. (Ableitung 1 − k·cos(2πu) ist stetig, also ohne Ruck.)
 */
export function danceTime(climaxes: readonly Climax[], t: number, barMs: number): number {
  const f = climaxes.find((c) => c.finale);
  if (!f) return t;
  const d = SLOWMO_BARS * barMs;
  const u = (t - f.atMs) / d;
  if (u <= 0 || u >= 1) return t;
  return f.atMs + d * (u - (SLOWMO_K * Math.sin(2 * Math.PI * u)) / (2 * Math.PI));
}
