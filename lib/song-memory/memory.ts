import { z } from "zod";

/**
 * Song-Gedächtnis: Was das Mikrofon über einen Song gemessen hat – Drops (Songzeit) und das sicher eingerastete
 * Tempo. Beim nächsten Abspielen sind die Drops vorab bekannt: Effekte zünden punktgenau statt eine Messung zu
 * spät, auch ganz ohne Mikrofon. Mehrere Abspielungen bestätigen einander (gezählt je Drop).
 */
export const memorySchema = z.object({
  /** Drops: Songzeit (ms) und wie oft gemessen */
  drops: z.array(z.object({ ms: z.number().nonnegative(), seen: z.number().int().positive() })).max(64),
  /** zuletzt sicher erkanntes Tempo */
  bpm: z.number().min(40).max(250).optional(),
  /** wie oft der Song mit Mikrofon gehört wurde */
  plays: z.number().int().nonnegative(),
});
export type SongMemory = z.infer<typeof memorySchema>;

/** Was der Kiosk nach einem Song meldet */
export const observationSchema = z.object({
  trackKey: z.string().min(1).max(200),
  drops: z
    .array(
      z
        .number()
        .nonnegative()
        .max(4 * 3600_000),
    )
    .max(64),
  bpm: z.number().min(40).max(250).optional(),
});
export type Observation = z.infer<typeof observationSchema>;

/** Zwei Messungen näher als das gehören zum selben Drop (Mikrofon-Latenz, Erkennung schwankt um einige Schläge) */
export const DROP_TOLERANCE_MS = 1200;
const MAX_DROPS = 64;

/** Neue Messung einrechnen: nahe Drops zusammenfassen (gewichteter Mittelwert), neue anhängen */
export function mergeObservation(mem: SongMemory | null, obs: Pick<Observation, "drops" | "bpm">): SongMemory {
  const drops = (mem?.drops ?? []).map((d) => ({ ...d }));
  for (const ms of obs.drops) {
    const near = drops.find((d) => Math.abs(d.ms - ms) <= DROP_TOLERANCE_MS);
    if (near) {
      near.ms = (near.ms * near.seen + ms) / (near.seen + 1);
      near.seen++;
    } else drops.push({ ms, seen: 1 });
  }
  drops.sort((a, b) => a.ms - b.ms);
  return {
    drops: drops.slice(0, MAX_DROPS).map((d) => ({ ms: Math.round(d.ms), seen: d.seen })),
    ...((obs.bpm ?? mem?.bpm) ? { bpm: obs.bpm ?? mem?.bpm } : {}),
    plays: (mem?.plays ?? 0) + 1,
  };
}

/**
 * Drops, denen man vorab trauen kann: bei nur einer Abspielung alle (besser als nichts), sonst nur die, die
 * mindestens zweimal gemessen wurden (Fehlalarme fallen so heraus).
 */
export function trustedDrops(mem: SongMemory | null | undefined): number[] {
  if (!mem?.drops.length) return [];
  const min = mem.plays >= 2 ? 2 : 1;
  return mem.drops.filter((d) => d.seen >= min).map((d) => d.ms);
}

/** Letzter bekannter Drop bis zur Songzeit t (für Effekte und Publikum wie bei einem live gemessenen Drop) */
export function lastDropBefore(drops: readonly number[], t: number): number | null {
  let out: number | null = null;
  for (const d of drops) if (d <= t && (out === null || d > out)) out = d;
  return out;
}
