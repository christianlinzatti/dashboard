import { z } from "zod";
import { parseLrc } from "../parse-lrc";
import { cleanTitle } from "../text";
import type { LyricsProvider, ProviderResult, TrackQuery } from "../types";

const BASE = "https://lrclib.net/api";
// Neutraler Client-Name, keine persönlichen Daten (LRCLIB bittet um einen User-Agent)
const UA = "SonicStage/0.3 (privates Lyrics-Dashboard)";

const recordSchema = z.object({
  id: z.number(),
  trackName: z.string(),
  artistName: z.string(),
  duration: z.number().nullable().optional(),
  instrumental: z.boolean().optional(),
  plainLyrics: z.string().nullable().optional(),
  syncedLyrics: z.string().nullable().optional(),
});
type LrclibRecord = z.infer<typeof recordSchema>;

export function fromRecord(rec: LrclibRecord, q: TrackQuery): ProviderResult | null {
  const durationMs = rec.duration ? Math.round(rec.duration * 1000) : undefined;
  if (rec.instrumental) return { provider: "lrclib", sync: "plain", lines: [], instrumental: true, durationMs };
  if (rec.syncedLyrics) {
    const { lines, hasWords } = parseLrc(rec.syncedLyrics, q.durationMs);
    return { provider: "lrclib", sync: hasWords ? "word" : "line", lines, durationMs };
  }
  if (rec.plainLyrics) {
    const lines = rec.plainLyrics
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((text) => ({ startMs: 0, endMs: 0, text }));
    return { provider: "lrclib", sync: "plain", lines, durationMs };
  }
  return null;
}

/** LRCLIB: freie, offene Lyrics-Datenbank (meist Zeilen-Sync, teils Enhanced-LRC). */
export function lrclib(fetchImpl: typeof fetch = fetch): LyricsProvider {
  const get = async (path: string, params: Record<string, string>, signal: AbortSignal) => {
    const res = await fetchImpl(`${BASE}${path}?${new URLSearchParams(params)}`, {
      headers: { "User-Agent": UA, "Lrclib-Client": UA },
      signal,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
    return res.json();
  };

  return {
    id: "lrclib",
    priority: 50,
    async search(q, signal) {
      const title = cleanTitle(q.title);
      const artist = q.artists[0] ?? "";
      const exact = await get(
        "/get",
        {
          track_name: title,
          artist_name: artist,
          ...(q.album ? { album_name: q.album } : {}),
          duration: String(Math.round(q.durationMs / 1000)),
        },
        signal,
      );
      if (exact) {
        const r = recordSchema.safeParse(exact);
        if (r.success) return fromRecord(r.data, q);
      }

      // Fallback: Suche, Treffer mit passender Dauer und synchronisiertem Text bevorzugen
      const list = z.array(recordSchema).safeParse(await get("/search", { track_name: title, artist_name: artist }, signal));
      if (!list.success || !list.data.length) return null;
      const scored = list.data
        .map((rec) => ({
          rec,
          diff: rec.duration ? Math.abs(rec.duration * 1000 - q.durationMs) : 99_000,
        }))
        .filter((x) => x.diff < 3500)
        .sort((a, b) => Number(!!b.rec.syncedLyrics) - Number(!!a.rec.syncedLyrics) || a.diff - b.diff);
      return scored[0] ? fromRecord(scored[0].rec, q) : null;
    },
  };
}
