/**
 * Tageszeit für die Freiluftbühnen (Festival, Strand, Stadion): Himmel und Sonne folgen der echten Uhrzeit. Sonnenauf-
 * und -untergang grob für Mitteleuropa (um 48° N, Ortszeit inkl. Sommerzeit) je Monat – für eine Bühnenstimmung genau
 * genug, ohne Standort und Astronomie-Rechnung.
 */
export const dayPhases = ["tag", "abend", "daemmerung", "nacht"] as const;
export type DayPhase = (typeof dayPhases)[number];

/** [Sonnenaufgang, Sonnenuntergang] in Stunden (Dezimal), Januar bis Dezember */
const SUN: ReadonlyArray<readonly [number, number]> = [
  [7.75, 16.6],
  [7.2, 17.35],
  [6.35, 18.25],
  [6.4, 19.9],
  [5.55, 20.55],
  [5.0, 20.95],
  [5.25, 20.85],
  [5.95, 20.15],
  [6.65, 19.15],
  [7.35, 18.2],
  [7.15, 16.6],
  [7.7, 16.25],
];

export function dayPhaseAt(date: Date): DayPhase {
  const [rise, set] = SUN[date.getMonth()]!;
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < rise - 0.75 || h >= set + 1.25) return "nacht";
  if (h < rise + 0.75) return "daemmerung"; // Morgendämmerung
  if (h >= set + 0.25) return "daemmerung"; // blaue Stunde
  if (h >= set - 1) return "abend"; // goldene Stunde, Sonnenuntergang
  return "tag";
}

export type SkyLook = { top: string; horizon: string; stars: number; sun: "hoch" | "tief" | "weg" | "mond" };

/** Himmel je Phase (Abend = die gestalteten Farben des Festivals) */
export const SKY_BY_PHASE: Record<DayPhase, SkyLook> = {
  tag: { top: "#2a64c8", horizon: "#b9dcf5", stars: 0, sun: "hoch" },
  abend: { top: "#0b1238", horizon: "#ff7a45", stars: 80, sun: "tief" },
  daemmerung: { top: "#10153f", horizon: "#b4507a", stars: 60, sun: "weg" },
  nacht: { top: "#020309", horizon: "#151b36", stars: 160, sun: "mond" },
};

/** Bühnen unter freiem Himmel, die der Tageszeit folgen */
export const OUTDOOR_SKIES = ["abend", "nacht", "strand"] as const;
