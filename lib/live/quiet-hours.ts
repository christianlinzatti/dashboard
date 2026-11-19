import { z } from "zod";

/**
 * Ruhezeit (Display-Zeitplan): In dieser Zeit wird der Bildschirm schwarz, solange keine Musik läuft – nachts
 * leuchtet das Dashboard nicht durch die Wohnung, und das Panel wird geschont. Läuft Musik, gibt es die Show wie
 * immer (dann ist ja jemand wach). Antippen weckt den Bildschirm für ein paar Minuten.
 */
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const quietHoursSchema = z
  .object({ from: z.string().regex(HHMM), to: z.string().regex(HHMM) })
  .refine((q) => q.from !== q.to, "Beginn und Ende sind gleich");
export type QuietHours = z.infer<typeof quietHoursSchema>;

/** Nach dem Antippen bleibt der Bildschirm so lange an */
export const WAKE_MS = 5 * 60_000;

const minutes = (hhmm: string) => {
  const m = HHMM.exec(hhmm)!;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Liegt die Uhrzeit (Ortszeit des Kiosks) in der Ruhezeit? Über Mitternacht (23:00–07:00) wird richtig gerechnet. */
export function inQuietHours(q: QuietHours | null | undefined, date: Date): boolean {
  if (!q) return false;
  const now = date.getHours() * 60 + date.getMinutes();
  const from = minutes(q.from);
  const to = minutes(q.to);
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/** Bildschirm schwarz? Nur in der Ruhezeit, ohne laufende Musik und nicht gerade geweckt */
export function screenOff(q: QuietHours | null | undefined, date: Date, playing: boolean, wokeAt: number | null): boolean {
  if (playing || !inQuietHours(q, date)) return false;
  return wokeAt === null || date.getTime() - wokeAt >= WAKE_MS;
}

/** Aus der Adresse (Demo/Test): ?ruhe=23:00-07:00 */
export function quietHoursFromParam(v: string | undefined): QuietHours | undefined {
  const m = v?.match(/^(\d\d:\d\d)-(\d\d:\d\d)$/);
  if (!m) return undefined;
  const p = quietHoursSchema.safeParse({ from: m[1], to: m[2] });
  return p.success ? p.data : undefined;
}
