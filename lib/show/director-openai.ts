import "server-only";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { sanitizeBrief, showBriefSchema } from "./brief";
import { describeSong, SHOW_SYSTEM_PROMPT, type DirectorResult, type SongFacts } from "./director";

/** Günstiges OpenAI-Modell mit strukturierter Ausgabe; über SHOW_AI_MODEL änderbar */
export const DEFAULT_OPENAI_SHOW_MODEL = "gpt-5.4-mini";

/**
 * KI-Regie über OpenAI – gleicher Auftrag, gleiche Prüfung wie bei Claude (lib/show/director.ts):
 * dieselbe Anweisung, dieselbe Songbeschreibung, dasselbe zod-Schema als strikte Ausgabe.
 */
export function createOpenAiShowDirector(deps: { client: OpenAI; model?: string }) {
  const model = deps.model || DEFAULT_OPENAI_SHOW_MODEL;
  return async function direct(facts: SongFacts): Promise<DirectorResult> {
    try {
      const res = await deps.client.chat.completions.parse({
        model,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: SHOW_SYSTEM_PROMPT },
          { role: "user", content: describeSong(facts) },
        ],
        response_format: zodResponseFormat(showBriefSchema, "show_brief"),
      });
      const message = res.choices[0]?.message;
      if (message?.refusal) return { brief: null, reason: "abgelehnt" };
      const brief = sanitizeBrief(message?.parsed);
      return brief ? { brief } : { brief: null, reason: "ungültig" };
    } catch (e) {
      if (
        e instanceof OpenAI.AuthenticationError ||
        e instanceof OpenAI.PermissionDeniedError ||
        e instanceof OpenAI.BadRequestError
      )
        return { brief: null, reason: "konfiguration" };
      if (e instanceof OpenAI.APIError) return { brief: null, reason: "vorübergehend" };
      throw e;
    }
  };
}
