import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { CACHE_TTL } from "@/lib/cache-policy";
import { showAi } from "@/lib/show/service";
import { errorText } from "@/lib/show/trace";
import type { Lyrics } from "@/lib/song-context/schema";
import { getCache, type Cache } from "./cache";
import { needsGermanTranslation } from "./second-line";
import { foundKey } from "./service";

/**
 * Deutsche Übersetzung des Liedtexts per KI – nur für Songs, die nicht deutsch sind und keine deutsche Übersetzung
 * mitbringen. Übersetzt wird nur der Text, der für diesen Song ohnehin im Lyrics-Cache liegt (die Schnittstelle nimmt
 * keinen freien Text an), jede Zeile einmal (Refrains wiederholen sich), Ergebnis 30 Tage im Cache.
 */
export const TRANSLATE_SYSTEM_PROMPT = `Du übersetzt Liedtexte ins Deutsche – als Untertitel, die auf einem Konzert-Bildschirm unter der Originalzeile mitlaufen.

Du bekommst nummerierte Zeilen eines Songs. Gib für jede Zeile genau eine deutsche Übersetzung zurück: gleiche Reihenfolge, gleiche Anzahl.
- sinngemäß und natürlich, wie man es auf Deutsch sagen würde – nicht Wort für Wort
- kurz: die Übersetzung soll in eine Zeile passen
- Ausrufe und Lautmalerei (oh, yeah, na-na, la la) und Eigennamen bleiben, wie sie sind
- keine Erklärungen, keine Anmerkungen, keine Nummern in der Antwort`;

export const translationSchema = z.object({ lines: z.array(z.string()) });

/** höchstens so viele verschiedene Zeilen bzw. Zeichen je Song (lange Texte: der Rest bleibt ohne Übersetzung) */
const MAX_LINES = 200;
const MAX_CHARS = 9000;

export type TranslateResult = {
  lines: string[] | null;
  reason?: "abgelehnt" | "ungültig" | "konfiguration" | "vorübergehend";
  error?: string;
};
export type Translate = (texts: string[]) => Promise<TranslateResult>;

const numbered = (texts: string[]) => texts.map((t, i) => `${i + 1}. ${t}`).join("\n");
const valid = (lines: string[] | undefined, n: number) =>
  lines && lines.length === n ? lines.map((l) => l.replace(/^\s*\d+\.\s*/, "").trim()) : null;

export function anthropicTranslator(client: Anthropic, model: string): Translate {
  return async (texts) => {
    try {
      const res = await client.beta.messages.parse({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: TRANSLATE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: numbered(texts) }],
        output_config: { effort: "low", format: betaZodOutputFormat(translationSchema) },
      });
      if (res.stop_reason === "refusal") return { lines: null, reason: "abgelehnt" };
      const lines = valid(res.parsed_output?.lines, texts.length);
      return lines ? { lines } : { lines: null, reason: "ungültig" };
    } catch (e) {
      if (
        e instanceof Anthropic.AuthenticationError ||
        e instanceof Anthropic.PermissionDeniedError ||
        e instanceof Anthropic.BadRequestError
      )
        return { lines: null, reason: "konfiguration", error: errorText(e) };
      if (e instanceof Anthropic.APIError) return { lines: null, reason: "vorübergehend", error: errorText(e) };
      throw e;
    }
  };
}

export function openAiTranslator(client: OpenAI, model: string): Translate {
  return async (texts) => {
    try {
      const res = await client.chat.completions.parse({
        model,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
          { role: "user", content: numbered(texts) },
        ],
        response_format: zodResponseFormat(translationSchema, "translation"),
      });
      const message = res.choices[0]?.message;
      if (message?.refusal) return { lines: null, reason: "abgelehnt" };
      const lines = valid(message?.parsed?.lines, texts.length);
      return lines ? { lines } : { lines: null, reason: "ungültig" };
    } catch (e) {
      if (
        e instanceof OpenAI.AuthenticationError ||
        e instanceof OpenAI.PermissionDeniedError ||
        e instanceof OpenAI.BadRequestError
      )
        return { lines: null, reason: "konfiguration", error: errorText(e) };
      if (e instanceof OpenAI.APIError) return { lines: null, reason: "vorübergehend", error: errorText(e) };
      throw e;
    }
  };
}

export type GermanLyrics =
  | { status: "ok"; byText: Record<string, string>; cached: boolean }
  | { status: "unnoetig" | "keine-ki" | "kein-text" }
  | { status: "fehler"; reason?: TranslateResult["reason"]; error?: string };

/** Verschiedene Zeilen in Songreihenfolge, begrenzt */
export function uniqueLines(lyrics: Pick<Lyrics, "lines">): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let chars = 0;
  for (const l of lyrics.lines) {
    const t = l.text.trim();
    if (!t || seen.has(t)) continue;
    if (out.length >= MAX_LINES || chars + t.length > MAX_CHARS) break;
    seen.add(t);
    out.push(t);
    chars += t.length;
  }
  return out;
}

export function createLyricsTranslator(deps: { cache: Cache; translate?: Translate; model?: string }) {
  const running = new Map<string, Promise<GermanLyrics>>();

  async function run(trackKey: string): Promise<GermanLyrics> {
    const stored = await deps.cache.get<{ lyrics: Lyrics | null }>(foundKey(trackKey));
    const lyrics = stored?.lyrics;
    if (!lyrics?.lines.length) return { status: "kein-text" };
    if (!needsGermanTranslation(lyrics)) return { status: "unnoetig" };
    if (!deps.translate) return { status: "keine-ki" };

    const key = `lyrics:de:v1:${deps.model ?? "ki"}:${trackKey}`;
    const hit = await deps.cache.get<{ byText: Record<string, string> | null }>(key);
    if (hit) return hit.byText ? { status: "ok", byText: hit.byText, cached: true } : { status: "fehler", reason: "ungültig" };

    const texts = uniqueLines(lyrics);
    const r = await deps.translate(texts);
    if (r.lines) {
      const byText = Object.fromEntries(texts.map((t, i) => [t, r.lines![i]!]));
      await deps.cache.set(key, { byText }, CACHE_TTL.showBrief);
      return { status: "ok", byText, cached: false };
    }
    // abgelehnt/unbrauchbar: nicht bei jedem Abspielen neu fragen; Störungen beim nächsten Mal neu versuchen
    if (r.reason === "abgelehnt" || r.reason === "ungültig")
      await deps.cache.set(key, { byText: null }, CACHE_TTL.showBriefMissing);
    return { status: "fehler", ...(r.reason ? { reason: r.reason } : {}), ...(r.error ? { error: r.error } : {}) };
  }

  /** gleichzeitige Anfragen für denselben Song teilen sich einen KI-Aufruf */
  return function germanFor(trackKey: string): Promise<GermanLyrics> {
    const busy = running.get(trackKey);
    if (busy) return busy;
    const p = run(trackKey).finally(() => running.delete(trackKey));
    running.set(trackKey, p);
    return p;
  };
}

let shared: ReturnType<typeof createLyricsTranslator> | undefined;
export function germanLyricsFor(trackKey: string) {
  if (!shared) {
    const ai = showAi(process.env);
    const translate =
      ai?.provider === "anthropic"
        ? anthropicTranslator(new Anthropic({ timeout: 55_000, maxRetries: 1 }), ai.model)
        : ai?.provider === "openai"
          ? openAiTranslator(new OpenAI({ timeout: 55_000, maxRetries: 1 }), ai.model)
          : undefined;
    shared = createLyricsTranslator({ cache: getCache(), translate, model: ai?.model });
  }
  return shared(trackKey);
}
