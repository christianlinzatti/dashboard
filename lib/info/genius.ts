import { z } from "zod";
import { normalizeLine } from "@/lib/lyrics/text";

type Http = (url: string, init?: RequestInit) => Promise<Response>;
const same = (a: string, b: string) => normalizeLine(a) === normalizeLine(b);
/** Titel ohne Zusätze wie „(feat. …)“, „- Remastered 2011“ */
const baseTitle = (t: string) => normalizeLine(t.replace(/\s*[([].*?[)\]]/g, "").replace(/\s+-\s+.*$/, ""));

const person = z.object({ name: z.string() });
const searchSchema = z.object({
  response: z.object({
    hits: z.array(
      z.object({
        type: z.string(),
        result: z.object({ id: z.number(), title: z.string(), url: z.string(), primary_artist: person }),
      }),
    ),
  }),
});
const songSchema = z.object({
  response: z.object({
    song: z.object({
      url: z.string(),
      producer_artists: z.array(person).default([]),
      writer_artists: z.array(person).default([]),
      song_relationships: z
        .array(
          z.object({ relationship_type: z.string(), songs: z.array(z.object({ title: z.string(), primary_artist: person })) }),
        )
        .default([]),
    }),
  }),
});

export type GeniusTrivia = { trivia: string[]; url: string };

const names = (list: Array<{ name: string }>, max: number, exclude: string[]) => {
  const ex = exclude.map(normalizeLine);
  const own = list.map((p) => p.name).filter((n) => !ex.includes(normalizeLine(n)));
  if (!own.length) return null;
  const shown = own.slice(0, max);
  return own.length > max
    ? `${shown.join(", ")} u. a.`
    : shown.length > 1
      ? `${shown.slice(0, -1).join(", ")} und ${shown.at(-1)}`
      : shown[0]!;
};

/**
 * Trivia von Genius (API mit Zugangstoken): Produzenten, Songwriter, Samples.
 * Genius liefert über die API keine Songtexte – nur Metadaten.
 */
export async function geniusTrivia(
  q: { title: string; artist: string; artists?: string[] },
  token: string,
  http: Http = fetch,
  signal?: AbortSignal,
): Promise<GeniusTrivia | null> {
  const headers = { Authorization: `Bearer ${token}` };
  const s = await http(`https://api.genius.com/search?${new URLSearchParams({ q: `${q.title} ${q.artist}` })}`, {
    headers,
    signal,
  });
  if (!s.ok) throw new Error(`Genius ${s.status}`);
  const hit = searchSchema
    .parse(await s.json())
    .response.hits.find(
      (h) =>
        h.type === "song" && same(h.result.primary_artist.name, q.artist) && baseTitle(h.result.title) === baseTitle(q.title),
    );
  if (!hit) return null;
  const r = await http(`https://api.genius.com/songs/${hit.result.id}?text_format=plain`, { headers, signal });
  if (!r.ok) throw new Error(`Genius ${r.status}`);
  const song = songSchema.parse(await r.json()).response.song;
  const own = q.artists ?? [q.artist];
  const trivia: string[] = [];
  const prod = names(song.producer_artists, 2, []);
  if (prod) trivia.push(`Produziert von ${prod}`);
  const writers = names(song.writer_artists, 3, own);
  if (writers) trivia.push(`Mitgeschrieben von ${writers}`);
  const rel = (type: string) => song.song_relationships.find((x) => x.relationship_type === type)?.songs ?? [];
  const sample = rel("samples")[0] ?? rel("interpolates")[0];
  if (sample) trivia.push(`${rel("samples").length ? "Sampelt" : "Zitiert"} „${sample.title}“ von ${sample.primary_artist.name}`);
  const sampledIn = rel("sampled_in").length;
  if (sampledIn) trivia.push(sampledIn === 1 ? "Wurde in einem anderen Song gesampelt" : `Wurde in ${sampledIn} Songs gesampelt`);
  const covers = rel("cover_of")[0];
  if (covers) trivia.push(`Coverversion von „${covers.title}“ (${covers.primary_artist.name})`);
  return { trivia, url: song.url };
}
