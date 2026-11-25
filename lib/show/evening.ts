import type { Mood } from "./brief";

/**
 * Spannungsbogen über den Abend: Jeder Song bekommt eine Phase aus dem, was vorher lief – wie bei einem echten
 * Konzert, das sich steigert, durchatmet und mit einer Zugabe endet. Rein und deterministisch (aus der Setlist).
 *
 * - auftakt: erster Song des Abends
 * - steigerung: der normale Lauf
 * - hoehepunkt: der dritte energiegeladene Song in Folge – volles Programm (Konfetti/Feuerwerk schon beim ersten Refrain)
 * - durchatmen: ein ruhiger Song nach mehreren wilden – Feuerzeuge, sanfteres Licht
 * - zugabe: nach einem ausgespielten Höhepunkt oder Lieblingssong ruft das Publikum nach mehr; der nächste Song ist die
 *   Zugabe (Zugabe-Rufe im Übergang, großes Programm). Nie zwei Zugaben hintereinander.
 */
export const eveningPhases = ["auftakt", "steigerung", "hoehepunkt", "durchatmen", "zugabe"] as const;
export type EveningPhase = (typeof eveningPhases)[number];

/** Was der Abend von einem gespielten Song wissen muss */
export type EveningEntry = {
  mood?: Mood;
  liked?: boolean;
  phase?: EveningPhase;
  /** bis (fast) zum Ende gespielt – sonst wurde geskippt und es gibt keine Zugabe */
  finished?: boolean;
  /** jemand hat nach einer Zugabe gerufen („Alexa, Zugabe!“, Fernbedienung) – der nächste Song ist sie */
  encoreAsked?: boolean;
};

/** Wie viele energiegeladene Songs in Folge zum Höhepunkt führen (der aktuelle mitgezählt) */
const PEAK_STREAK = 3;

export function eveningPhase(before: readonly EveningEntry[], mood: Mood | undefined): EveningPhase {
  const last = before.at(-1);
  if (!last) return "auftakt";
  if (last.encoreAsked && last.phase !== "zugabe") return "zugabe";
  if (last.finished && last.phase !== "zugabe" && (last.liked || last.phase === "hoehepunkt")) return "zugabe";
  let streak = 0;
  for (let i = before.length - 1; i >= 0 && before[i]!.mood === "energetisch"; i--) streak++;
  if (mood === "energetisch" && streak + 1 >= PEAK_STREAK) return "hoehepunkt";
  if (mood === "ruhig" && streak >= 2) return "durchatmen";
  return "steigerung";
}

/** Großes Programm (Konfetti/Feuerwerk schon beim ersten großen Einsatz) */
export const isBigNight = (p: EveningPhase) => p === "hoehepunkt" || p === "zugabe";
