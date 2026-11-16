import { z } from "zod";
import { normalizeLine } from "@/lib/lyrics/text";
import type { Mood } from "./brief";

type Http = (url: string, signal?: AbortSignal) => Promise<Response>;

/**
 * Genres und Stimmung aus offenen Quellen – Spotify liefert für neue Apps keine Genres mehr, ohne sie
 * wählt die Show Bühne und Tänze nur zufällig. Quellen: TheAudioDB (Genre, Stil, Stimmung des Künstlers)
 * und Last.fm (Top-Tags zum Titel, sonst zum Künstler).
 */
export type MusicTags = { genres: string[]; mood?: Mood };

/** Tags, die nichts über die Musik sagen */
const JUNK =
  /^(seen live|favou?rites?|favou?rite songs?|love|loved|awesome|beautiful|cool|good|best|my .*|spotify|albums i own|\d{2,4}s?|all|under \d+.*|.* i (like|love)|male vocalists?|female vocalists?|vocalists?)$/i;

export function cleanTags(tags: string[], artistNames: string[] = []): string[] {
  const artists = new Set(artistNames.map(normalizeLine));
  const out: string[] = [];
  for (const t of tags) {
    const g = t.trim().toLowerCase().replace(/\s+/g, " ");
    if (!g || g.length > 30 || JUNK.test(g) || artists.has(normalizeLine(g)) || out.includes(g)) continue;
    out.push(g);
  }
  return out.slice(0, 6);
}

const CALM = /relax|calm|sad|melanchol|dream|mellow|sleep|peace|soft|chill|ambient|ballad|acoustic|romantic|gentle|slow/i;
const ENERGETIC = /energ|party|happy|upbeat|angry|aggress|intense|danc|power|euphor|rowdy|excit|hard|fast|club/i;

/** Stimmung aus Stimmungs-/Genre-Wörtern (TheAudioDB „Mood“, Last.fm-Tags) */
export function moodFrom(words: string[]): Mood | undefined {
  let score = 0;
  for (const w of words) {
    if (CALM.test(w)) score--;
    if (ENERGETIC.test(w)) score++;
  }
  return score < 0 ? "ruhig" : score > 0 ? "energetisch" : undefined;
}

const str = z
  .string()
  .nullish()
  .transform((v) => v?.trim() || undefined);
const audioDbSchema = z.object({
  artists: z.array(z.object({ strArtist: z.string(), strGenre: str, strStyle: str, strMood: str })).nullable(),
});

export async function audioDbTags(
  artist: string,
  http: Http,
  key: string,
  signal?: AbortSignal,
): Promise<{ genres: string[]; moods: string[] }> {
  const res = await http(
    `https://www.theaudiodb.com/api/v1/json/${encodeURIComponent(key)}/search.php?s=${encodeURIComponent(artist)}`,
    signal,
  );
  if (!res.ok) throw new Error(`TheAudioDB ${res.status}`);
  const hit = (audioDbSchema.parse(await res.json()).artists ?? []).find(
    (a) => normalizeLine(a.strArtist) === normalizeLine(artist),
  );
  if (!hit) return { genres: [], moods: [] };
  // „Rock/Pop“ → zwei Genres
  const genres = [hit.strGenre, hit.strStyle].flatMap((g) => g?.split("/") ?? []);
  return { genres, moods: hit.strMood ? [hit.strMood] : [] };
}

const lastfmSchema = z.object({
  toptags: z
    .object({
      tag: z
        .array(z.object({ name: z.string(), count: z.coerce.number() }))
        .or(z.object({ name: z.string(), count: z.coerce.number() })),
    })
    .optional(),
  error: z.number().optional(),
});

/** Last.fm-Top-Tags (nur Tags, die mindestens ein Fünftel so oft wie das häufigste vergeben wurden) */
export async function lastfmTags(
  q: { artist: string; title?: string },
  http: Http,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const p = new URLSearchParams({
    method: q.title ? "track.gettoptags" : "artist.gettoptags",
    artist: q.artist,
    ...(q.title ? { track: q.title } : {}),
    autocorrect: "1",
    api_key: apiKey,
    format: "json",
  });
  const res = await http(`https://ws.audioscrobbler.com/2.0/?${p}`, signal);
  if (!res.ok) throw new Error(`Last.fm ${res.status}`);
  const data = lastfmSchema.parse(await res.json());
  const tags = data.toptags?.tag;
  const list = Array.isArray(tags) ? tags : tags ? [tags] : [];
  const top = Math.max(...list.map((t) => t.count), 1);
  return list.filter((t) => t.count >= top / 5).map((t) => t.name);
}

/** Alle Quellen zusammen; einzelne Ausfälle sind egal. `complete` = keine Quelle ist ausgefallen. */
export async function collectTags(
  q: { title: string; artists: string[] },
  deps: { http: Http; audioDbKey: string; lastfmKey?: string; signal?: AbortSignal },
): Promise<MusicTags & { complete: boolean }> {
  const lead = q.artists[0];
  if (!lead) return { genres: [], complete: true };
  const [db, track, artist] = await Promise.allSettled([
    audioDbTags(lead, deps.http, deps.audioDbKey, deps.signal),
    deps.lastfmKey ? lastfmTags({ artist: lead, title: q.title }, deps.http, deps.lastfmKey, deps.signal) : Promise.resolve([]),
    deps.lastfmKey ? lastfmTags({ artist: lead }, deps.http, deps.lastfmKey, deps.signal) : Promise.resolve([]),
  ]);
  const val = <T>(r: PromiseSettledResult<T>, fallback: T) => (r.status === "fulfilled" ? r.value : fallback);
  const d = val(db, { genres: [], moods: [] });
  const trackTags = val(track, []);
  const raw = [...trackTags, ...d.genres, ...val(artist, [])];
  return {
    genres: cleanTags(raw, q.artists),
    mood: moodFrom([...d.moods, ...trackTags]),
    complete: [db, track, artist].every((r) => r.status === "fulfilled"),
  };
}
