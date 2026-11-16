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
import { collectTags, type MusicTags } from "./tags";

export type ShowQuery = { trackKey: string; title: string; artists: string[]; album?: string; year?: number; durationMs: number };
export type ShowResponse = MusicTags & {
  brief: ShowBrief | null;
  /** woher die Regie kommt: KI-Modell oder nur die eingebauten Regeln */
  source: { tags: "quellen" | "keine"; brief: string | null };
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
    const briefKey = `show:brief:v1:${model}:${q.trackKey}`;
    const hit = await deps.cache.get<{ brief: ShowBrief | null }>(briefKey);
    if (hit) return { ...merge(tags, hit.brief), brief: hit.brief, source: { ...source, brief: hit.brief ? model : null } };

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
    return { ...merge(tags, r.brief), brief: r.brief, source: { ...source, brief: r.brief ? model : null } };
  };
}

/** Die Regie darf Genres und Stimmung ergänzen, wenn die Quellen nichts wissen */
function merge(tags: MusicTags, brief: ShowBrief | null): MusicTags {
  return { genres: tags.genres.length ? tags.genres : (brief?.genres ?? []), mood: tags.mood ?? brief?.mood };
}

let shared: ReturnType<typeof createShowService> | undefined;
export function showFor(q: ShowQuery) {
  if (!shared) {
    const env = process.env;
    const model = env.SHOW_AI_MODEL || undefined;
    // Schlüssel aus der Umgebung (ANTHROPIC_API_KEY); 45 s reichen für einen kurzen Brief, ein Neuversuch
    const direct = env.ANTHROPIC_API_KEY
      ? createShowDirector({ client: new Anthropic({ timeout: 45_000, maxRetries: 1 }), model })
      : undefined;
    shared = createShowService({
      cache: getCache(),
      http: (url, signal) => fetch(url, { signal, headers: { "User-Agent": "sonic-stage/1.0" } }),
      audioDbKey: env.THEAUDIODB_API_KEY || AUDIODB_TEST_KEY,
      lastfmKey: env.LASTFM_API_KEY || undefined,
      direct,
      model,
    });
  }
  return shared(q);
}
