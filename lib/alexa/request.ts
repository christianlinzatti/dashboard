import { z } from "zod";

/** Nur die Teile der Alexa-Anfrage, die wir brauchen. */
export const alexaRequestSchema = z.object({
  version: z.string(),
  session: z
    .object({ application: z.object({ applicationId: z.string() }) })
    .partial()
    .optional(),
  context: z.object({ System: z.object({ application: z.object({ applicationId: z.string() }) }) }).optional(),
  request: z.object({
    type: z.string(),
    timestamp: z.string(),
    intent: z
      .object({
        name: z.string(),
        slots: z
          .record(
            z.string(),
            z.object({
              value: z.string().optional(),
              resolutions: z
                .object({
                  resolutionsPerAuthority: z.array(
                    z.object({
                      status: z.object({ code: z.string() }),
                      values: z.array(z.object({ value: z.object({ id: z.string() }) })).optional(),
                    }),
                  ),
                })
                .optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  }),
});
export type AlexaRequest = z.infer<typeof alexaRequestSchema>;

export function speak(text: string, endSession = true) {
  return { version: "1.0", response: { outputSpeech: { type: "PlainText", text }, shouldEndSession: endSession } };
}

/** Wert eines Slots: zuerst die aufgelöste ID (Synonyme), sonst der gesprochene Wert. */
export function slot(req: AlexaRequest, name: string): string | undefined {
  const s = req.request.intent?.slots?.[name];
  const resolved = s?.resolutions?.resolutionsPerAuthority.find((a) => a.status.code === "ER_SUCCESS_MATCH")?.values?.[0]?.value
    .id;
  return (resolved ?? s?.value)?.toLowerCase();
}

/** Gesprochener Slot-Wert ohne Auflösung (z. B. Künstlername). */
export function slotRaw(req: AlexaRequest, name: string): string | undefined {
  return req.request.intent?.slots?.[name]?.value || undefined;
}
