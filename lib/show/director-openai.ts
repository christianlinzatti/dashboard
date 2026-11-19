import "server-only";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { sanitizeBrief, showBriefSchema } from "./brief";
import { describeSong, SHOW_SYSTEM_PROMPT, type DirectorResult, type SongFacts } from "./director";
import { errorText, type AiTrace } from "./trace";

/** Günstiges OpenAI-Modell mit strukturierter Ausgabe; über SHOW_AI_MODEL änderbar */
export const DEFAULT_OPENAI_SHOW_MODEL = "gpt-5.4-mini";

/**
 * KI-Regie über OpenAI – gleicher Auftrag, gleiche Prüfung wie bei Claude (lib/show/director.ts):
 * dieselbe Anweisung, dieselbe Songbeschreibung, dasselbe zod-Schema als strikte Ausgabe.
 */
export function createOpenAiShowDirector(deps: { client: OpenAI; model?: string }) {
  const model = deps.model || DEFAULT_OPENAI_SHOW_MODEL;
  return async function direct(facts: SongFacts): Promise<DirectorResult> {
    const user = describeSong(facts);
    const t0 = Date.now();
    const trace = (rest: Omit<AiTrace, "provider" | "model" | "at" | "ms" | "system" | "user">): AiTrace => ({
      provider: "openai",
      model,
      at: t0,
      ms: Date.now() - t0,
      system: SHOW_SYSTEM_PROMPT,
      user,
      ...rest,
    });
    try {
      const res = await deps.client.chat.completions.parse({
        model,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: SHOW_SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
        response_format: zodResponseFormat(showBriefSchema, "show_brief"),
      });
      const choice = res.choices[0];
      const message = choice?.message;
      const seen = {
        servedModel: res.model,
        response: message?.content ?? message?.refusal ?? undefined,
        stop: choice?.finish_reason ?? undefined,
        usage: res.usage && { input: res.usage.prompt_tokens, output: res.usage.completion_tokens },
      };
      if (message?.refusal) return { brief: null, reason: "abgelehnt", trace: trace({ ...seen, outcome: "abgelehnt" }) };
      const brief = sanitizeBrief(message?.parsed);
      return brief
        ? { brief, trace: trace({ ...seen, outcome: "ok" }) }
        : { brief: null, reason: "ungültig", trace: trace({ ...seen, outcome: "ungültig" }) };
    } catch (e) {
      if (
        e instanceof OpenAI.AuthenticationError ||
        e instanceof OpenAI.PermissionDeniedError ||
        e instanceof OpenAI.BadRequestError
      )
        return { brief: null, reason: "konfiguration", trace: trace({ outcome: "konfiguration", error: errorText(e) }) };
      if (e instanceof OpenAI.APIError)
        return { brief: null, reason: "vorübergehend", trace: trace({ outcome: "vorübergehend", error: errorText(e) }) };
      throw e;
    }
  };
}
