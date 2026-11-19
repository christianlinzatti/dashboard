import { z } from "zod";

/**
 * Mitschrift eines KI-Regie-Aufrufs (Debug-Panel, /debug): die komplette Frage (Anweisung + Songbeschreibung) und
 * die rohe Antwort des Modells, dazu Dauer, Token und Ergebnis. Liegt neben dem Brief im Server-Cache.
 */
export const aiTraceSchema = z.object({
  provider: z.enum(["anthropic", "openai"]),
  /** angefragtes Modell */
  model: z.string(),
  /** Modell, das wirklich geantwortet hat (Ausweich-Fallback kann ein anderes sein) */
  servedModel: z.string().optional(),
  at: z.number(),
  ms: z.number(),
  system: z.string(),
  user: z.string(),
  /** Rohtext der Antwort (JSON nach dem Brief-Schema) */
  response: z.string().optional(),
  stop: z.string().optional(),
  usage: z.object({ input: z.number().optional(), output: z.number().optional() }).optional(),
  outcome: z.enum(["ok", "abgelehnt", "ungültig", "konfiguration", "vorübergehend"]),
  error: z.string().optional(),
});
export type AiTrace = z.infer<typeof aiTraceSchema>;

/** Antwort von /api/show/trace */
export type AiTraceInfo = {
  /** eingerichtete KI (oder null: keine Schlüssel – Show nach festen Regeln) */
  ai: { provider: string; model: string } | null;
  trace: AiTrace | null;
};

const ERROR_MAX = 600;
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, ERROR_MAX);
