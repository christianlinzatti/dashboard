import { z } from "zod";

/** Ein Eintrag im Kiosk-Protokoll (Fehler oder Leistungsprobe). */
export const logEntrySchema = z.object({
  level: z.enum(["fehler", "warnung", "info"]),
  /** z. B. „js“, „3D-Bühne“, „leistung“ */
  source: z.string().min(1).max(40),
  message: z.string().min(1).max(500),
  /** gleiche Meldung zusammengefasst */
  count: z.number().int().positive().max(10_000).default(1),
  at: z.number(),
});
export type LogEntry = z.infer<typeof logEntrySchema>;
export const logBatchSchema = z.object({ entries: z.array(logEntrySchema).min(1).max(20) });
