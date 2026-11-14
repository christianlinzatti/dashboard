import { z } from "zod";
import type { CommandInput, Snapshot } from "@/lib/song-context/snapshot";

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
function slot(req: AlexaRequest, name: string): string | undefined {
  const s = req.request.intent?.slots?.[name];
  const resolved = s?.resolutions?.resolutionsPerAuthority.find((a) => a.status.code === "ER_SUCCESS_MATCH")?.values?.[0]?.value
    .id;
  return (resolved ?? s?.value)?.toLowerCase();
}

export const STALE_MS = 30_000;

export type HandlerDeps = {
  getSnapshot: () => Promise<Snapshot | null>;
  pushCommand: (c: CommandInput) => Promise<unknown>;
  now?: () => number;
};

function artistsText(s: Snapshot) {
  const main = s.artists.filter((a) => a.role === "main").map((a) => a.name);
  const feat = s.artists.filter((a) => a.role === "feature").map((a) => a.name);
  return feat.length ? `${main.join(" und ")} featuring ${feat.join(" und ")}` : main.join(" und ");
}

const onOff = (v: string | undefined) => (v === "an" ? true : v === "aus" ? false : undefined);

/** Beantwortet eine (bereits geprüfte) Alexa-Anfrage. Sprache: Deutsch. */
export async function handleAlexa(req: AlexaRequest, deps: HandlerDeps) {
  const now = deps.now?.() ?? Date.now();
  const type = req.request.type;
  if (type === "LaunchRequest") return speak("Sonic Stage ist bereit. Frag mich zum Beispiel, welcher Song gerade läuft.", false);
  if (type === "SessionEndedRequest") return { version: "1.0", response: {} };
  if (type !== "IntentRequest") return speak("Das habe ich nicht verstanden.");

  const intent = req.request.intent?.name;
  const live = async () => {
    const s = await deps.getSnapshot();
    return s && now - s.updatedAt < STALE_MS ? s : null;
  };

  switch (intent) {
    case "WelcherSongIntent": {
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      if (!s.isPlaying) return speak(`Pausiert: ${s.title} von ${artistsText(s)}.`);
      return speak(`Gerade läuft ${s.title} von ${artistsText(s)}.`);
    }
    case "WerSingtIntent": {
      const s = await live();
      if (!s) return speak("Das Dashboard ist gerade nicht aktiv.");
      if (s.activeSinger) return speak(`Gerade singt ${s.activeSinger}.`);
      return speak(`Das ist ${s.title} von ${artistsText(s)}.`);
    }
    case "LampenIntent": {
      const on = onOff(slot(req, "zustand"));
      if (on === undefined) return speak("Soll ich die Lampen an- oder ausschalten?", false);
      await deps.pushCommand({ type: "lampen", on });
      return speak(on ? "Die Lampen tanzen wieder mit." : "Die Lampen sind aus.");
    }
    case "StroboIntent": {
      const on = onOff(slot(req, "zustand"));
      if (on === undefined) return speak("Soll ich das Stroboskop an- oder ausschalten?", false);
      await deps.pushCommand({ type: "strobo", on });
      return speak(on ? "Stroboskop an." : "Stroboskop aus.");
    }
    case "QualitaetIntent": {
      const v = slot(req, "stufe");
      const value = v === "automatisch" ? "auto" : v;
      if (value !== "auto" && value !== "niedrig" && value !== "mittel" && value !== "hoch") {
        return speak("Welche Qualität? Niedrig, mittel, hoch oder automatisch.", false);
      }
      await deps.pushCommand({ type: "qualitaet", value });
      return speak(`Bühnenqualität ${v}.`);
    }
    case "AMAZON.HelpIntent":
      return speak("Du kannst fragen: Welcher Song läuft? Wer singt gerade? Oder sagen: Lampen aus, Stroboskop an.", false);
    case "AMAZON.StopIntent":
    case "AMAZON.CancelIntent":
      return speak("Tschüss!");
    default:
      return speak("Das kann ich noch nicht. Sag Hilfe für Beispiele.");
  }
}

export function applicationIdOf(req: AlexaRequest) {
  return req.context?.System.application.applicationId ?? req.session?.application?.applicationId;
}
