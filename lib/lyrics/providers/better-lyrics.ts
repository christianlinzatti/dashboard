import { z } from "zod";
import { normalizeLine } from "../text";
import { parseTtml } from "../parse-ttml";
import type { LyricsProvider, ProviderResult, TrackQuery } from "../types";

const BASE = "https://lyrics-api.boidu.dev/getLyrics";
const responseSchema = z.union([
  z.object({ ttml: z.string().min(1) }),
  z.object({ error: z.string(), message: z.string().optional() }),
]);

/**
 * Sänger-Zuordnung: Agent-Name = Artist-Name, sonst bei mehreren Sängern in Reihenfolge
 * (v1 → Haupt-Artist, v2 → erster Feature-Artist …). Ein einzelner Sänger braucht keine Zuordnung.
 */
export function mapAgents(agents: Array<{ id: string; name?: string }>, q: TrackQuery): Record<string, string> | undefined {
  const ids = q.artistIds;
  if (!ids?.length || agents.length < 2) return undefined;
  const byName = new Map(q.artists.map((n, i) => [normalizeLine(n), ids[i]]));
  const out: Record<string, string> = {};
  agents.forEach((a, i) => {
    const id = (a.name && byName.get(normalizeLine(a.name))) || (agents.length <= ids.length ? ids[i] : undefined);
    if (id) out[a.id] = id;
  });
  return Object.keys(out).length ? out : undefined;
}

export function fromTtml(ttml: string, q: TrackQuery): ProviderResult | null {
  const doc = parseTtml(ttml, q.durationMs);
  if (!doc.lines.length) return null;
  const sync = doc.timing === "word" && doc.lines.some((l) => l.words?.length) ? "word" : "line";
  const singers = mapAgents(doc.agents, q);
  return {
    provider: "better-lyrics",
    sync,
    lines: doc.lines,
    ...(doc.durationMs !== undefined ? { durationMs: doc.durationMs } : {}),
    ...(doc.sections.length ? { sections: doc.sections } : {}),
    ...(singers ? { singers } : {}),
    ...(doc.transliterationLang ? { transliterationLang: doc.transliterationLang } : {}),
    ...(doc.translationLang ? { translationLang: doc.translationLang } : {}),
  };
}

/**
 * Better Lyrics (lyrics-api.boidu.dev): Apple-Music-TTML mit Wort-Timing und Songabschnitten.
 * Ohne API-Key nur Songs aus dem Cache des Dienstes; sonst 401 („API key required“) → kein Treffer.
 */
export function betterLyrics(opts: { apiKey?: string; fetch?: typeof fetch } = {}): LyricsProvider {
  const f = opts.fetch ?? fetch;
  return {
    id: "better-lyrics",
    priority: 10,
    async search(q, signal) {
      const params = new URLSearchParams({
        s: q.title,
        a: q.artists[0] ?? "",
        ...(q.album ? { al: q.album } : {}),
        d: String(Math.round(q.durationMs / 1000)),
      });
      const res = await f(`${BASE}?${params}`, { headers: opts.apiKey ? { "X-API-Key": opts.apiKey } : {}, signal });
      if (res.status === 401 || res.status === 404) return null;
      if (!res.ok) throw new Error(`Better Lyrics ${res.status}`);
      const body = responseSchema.parse(await res.json());
      return "ttml" in body ? fromTtml(body.ttml, q) : null;
    },
  };
}
