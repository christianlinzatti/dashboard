import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { CACHE_TTL } from "@/lib/cache-policy";
import { AUDIODB_TEST_KEY } from "@/lib/info/theaudiodb";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import { foundKey } from "@/lib/lyrics/service";
import type { Lyrics } from "@/lib/song-context/schema";
import { contiguous } from "@/lib/song-context/sections";
import type { ShowBrief } from "./brief";
import { createShowDirector, DEFAULT_SHOW_MODEL, type DirectorResult, type SongFacts } from "./director";
import OpenAI from "openai";
import { createOpenAiShowDirector, DEFAULT_OPENAI_SHOW_MODEL } from "./director-openai";
import { collectTags, type MusicTags } from "./tags";
import { aiTraceSchema, type AiTrace, type AiTraceInfo } from "./trace";

export type ShowQuery = { trackKey: string; title: string; artists: string[]; album?: string; year?: number; durationMs: number };
export type ShowResponse = MusicTags & {
  brief: ShowBrief | null;
  /** woher die Regie kommt: KI-Modell oder nur die eingebauten Regeln */
  source: {
    tags: "quellen" | "keine";
    brief: string | null;
    /** Brief kam aus dem Server-Cache (die KI wurde für diesen Song schon früher gefragt) */
    cached?: boolean;
    /** warum es keinen Brief gibt */
    reason?: DirectorResult["reason"];
  };
};

type Deps = {
  cache: Cache;
  http: (url: string, signal?: AbortSignal) => Promise<Response>;
  audioDbKey: string;
  lastfmKey?: string;
  /** fehlt ohne ANTHROPIC_API_KEY – dann nur Genres/Stimmung */
  direct?: (facts: SongFacts) => Promise<DirectorResult>;
  model?: string;
};

const LYRICS_EXCERPT = 2400;

/** Textauszug für die Regie: Zeilen ohne Wiederholungen, begrenzt (reicht für Thema und Stimmung) */
export function lyricsExcerpt(lyrics: Lyrics | null | undefined): string | undefined {
  if (!lyrics?.lines.length) return undefined;
  const seen = new Set<string>();
  let out = "";
  for (const l of lines(lyrics)) {
    const key = l.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (out.length + l.length > LYRICS_EXCERPT) break;
    out += `${l}\n`;
  }
  return out.trim() || undefined;
}
const lines = (lyrics: Lyrics) => lyrics.lines.map((l) => l.text.trim()).filter(Boolean);

export function createShowService(deps: Deps) {
  return async function showFor(q: ShowQuery): Promise<ShowResponse> {
    // 1. Genres und Stimmung (auch ohne KI nützlich)
    const tagsKey = `show:tags:v1:${q.trackKey}`;
    let tags = await deps.cache.get<MusicTags>(tagsKey);
    if (!tags) {
      const fresh = await collectTags(q, {
        http: deps.http,
        audioDbKey: deps.audioDbKey,
        lastfmKey: deps.lastfmKey,
        signal: AbortSignal.timeout(5000),
      });
      tags = { genres: fresh.genres, mood: fresh.mood };
      await deps.cache.set(tagsKey, tags, fresh.complete ? CACHE_TTL.showTags : CACHE_TTL.showTagsPartial);
    }
    const source = { tags: tags.genres.length ? ("quellen" as const) : ("keine" as const), brief: null as string | null };
    if (!deps.direct) return { ...tags, brief: null, source };

    // 2. KI-Regie (einmal je Song und Modell)
    const model = deps.model || DEFAULT_SHOW_MODEL;
    // v2: mit Ansagen je Abendphase
    const briefKey = `show:brief:v2:${model}:${q.trackKey}`;
    const hit = await deps.cache.get<{ brief: ShowBrief | null }>(briefKey);
    if (hit)
      return {
        ...merge(tags, hit.brief),
        brief: hit.brief,
        source: { ...source, brief: hit.brief ? model : null, cached: true },
      };

    const stored = await deps.cache.get<{ lyrics: Lyrics | null }>(foundKey(q.trackKey));
    const lyrics = stored?.lyrics;
    const sections = lyrics?.sections.length
      ? contiguous(lyrics.sections, q.durationMs).map((s) => ({
          kind: s.kind,
          seconds: Math.round((s.endMs - s.startMs) / 1000),
        }))
      : [];
    const r = await deps.direct({ ...q, tags: tags.genres, sections, lyrics: lyricsExcerpt(lyrics) });
    // dauerhafte Ergebnisse merken; bei Störungen oder falscher Konfiguration beim nächsten Song neu versuchen
    if (r.brief) await deps.cache.set(briefKey, { brief: r.brief }, CACHE_TTL.showBrief);
    else if (r.reason === "abgelehnt" || r.reason === "ungültig")
      await deps.cache.set(briefKey, { brief: null }, CACHE_TTL.showBriefMissing);
    // Frage und Antwort fürs Debug-Panel (auch bei Fehlern – gerade dann interessant)
    if (r.trace)
      await deps.cache.set(traceKey(model, q.trackKey), r.trace, r.brief ? CACHE_TTL.showBrief : CACHE_TTL.showBriefMissing);
    return {
      ...merge(tags, r.brief),
      brief: r.brief,
      source: { ...source, brief: r.brief ? model : null, ...(r.reason ? { reason: r.reason } : {}) },
    };
  };
}

const traceKey = (model: string, trackKey: string) => `show:trace:v1:${model}:${trackKey}`;

/** Letzte Frage und Antwort der KI-Regie zu einem Song (Debug-Panel) */
export async function readShowTrace(cache: Cache, model: string, trackKey: string): Promise<AiTrace | null> {
  const raw = await cache.get<unknown>(traceKey(model, trackKey));
  const p = aiTraceSchema.safeParse(raw);
  return p.success ? p.data : null;
}

/** Die Regie darf Genres und Stimmung ergänzen, wenn die Quellen nichts wissen */
function merge(tags: MusicTags, brief: ShowBrief | null): MusicTags {
  return { genres: tags.genres.length ? tags.genres : (brief?.genres ?? []), mood: tags.mood ?? brief?.mood };
}

export type ShowAi = { provider: "anthropic" | "openai"; model: string } | null;

/**
 * Welcher KI-Anbieter die Regie schreibt: SHOW_AI_PROVIDER legt fest, sonst der, dessen Schlüssel gesetzt ist
 * (Claude zuerst). Ohne Schlüssel keine KI – die Show läuft dann mit den eingebauten Regeln.
 */
export function showAi(env: Record<string, string | undefined>): ShowAi {
  const wanted = env.SHOW_AI_PROVIDER?.trim().toLowerCase();
  const anthropic = !!env.ANTHROPIC_API_KEY && (!wanted || wanted === "anthropic" || wanted === "claude");
  const openai = !!env.OPENAI_API_KEY && (!wanted || wanted === "openai");
  if (anthropic) return { provider: "anthropic", model: env.SHOW_AI_MODEL || DEFAULT_SHOW_MODEL };
  if (openai) return { provider: "openai", model: env.SHOW_AI_MODEL || DEFAULT_OPENAI_SHOW_MODEL };
  return null;
}

let shared: ReturnType<typeof createShowService> | undefined;
export function showFor(q: ShowQuery) {
  if (!shared) {
    const env = process.env;
    const ai = showAi(env);
    // Schlüssel kommen aus der Umgebung; 45 s reichen für einen kurzen Brief, ein Neuversuch
    const direct =
      ai?.provider === "anthropic"
        ? createShowDirector({ client: new Anthropic({ timeout: 45_000, maxRetries: 1 }), model: ai.model })
        : ai?.provider === "openai"
          ? createOpenAiShowDirector({ client: new OpenAI({ timeout: 45_000, maxRetries: 1 }), model: ai.model })
          : undefined;
    shared = createShowService({
      cache: getCache(),
      http: (url, signal) => fetch(url, { signal, headers: { "User-Agent": "sonic-stage/1.0" } }),
      audioDbKey: env.THEAUDIODB_API_KEY || AUDIODB_TEST_KEY,
      lastfmKey: env.LASTFM_API_KEY || undefined,
      direct,
      model: ai?.model,
    });
  }
  return shared(q);
}

/** Für /api/show/trace: welche KI eingerichtet ist und was sie zuletzt zu diesem Song gefragt und geantwortet hat */
export async function showTrace(trackKey: string): Promise<AiTraceInfo> {
  const ai = showAi(process.env);
  if (!ai) return { ai: null, trace: null };
  return { ai, trace: await readShowTrace(getCache(), ai.model, trackKey) };
}
