import "server-only";
import { CACHE_TTL } from "@/lib/cache-policy";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import { normalizeLine } from "@/lib/lyrics/text";
import type { Info, Photo } from "@/lib/song-context/schema";
import { flickrPhotos } from "./flickr";
import { geniusTrivia } from "./genius";
import { songArticle } from "./song-wiki";
import type { WikiSummary } from "./wikimedia";
import { createPoliteFetch, SourceBusyError } from "./http";
import { findArtist, type MbArtist } from "./musicbrainz";
import { AUDIODB_TEST_KEY, audioDbArtist } from "./theaudiodb";
import { commonsImage, wikidataEntity, wikipediaSummary } from "./wikimedia";

type Http = (url: string, signal?: AbortSignal) => Promise<Response>;

export type ArtistInfo = {
  name: string;
  summary: string;
  wikiUrl: string;
  lang: "de" | "en";
  textSource: "wikipedia" | "theaudiodb";
  facts: string[];
  logo?: string;
  photos: Array<Omit<Photo, "artistId">>;
  /** eine optionale Quelle (TheAudioDB, Flickr, Commons) ist ausgefallen → nur kurz cachen */
  partial?: boolean;
};

export type SourceKeys = {
  /** null = TheAudioDB aus; Standard: öffentlicher Test-Key */
  audioDb?: string | null;
  flickr?: string;
};

const year = (d?: string) => d?.match(/^(\d{4})/)?.[1];

/** Kurzfakten aus MusicBrainz (Gründung/Geburt, Auflösung). */
export function factsFor(a: Pick<MbArtist, "type" | "begin" | "end">): string[] {
  const out: string[] = [];
  const b = year(a.begin);
  const e = year(a.end);
  if (a.type === "Group") {
    if (b) out.push(`Gegründet ${b}`);
    if (e) out.push(`Aufgelöst ${e}`);
  } else if (a.type === "Person" && b) out.push(`Geboren ${b}`);
  return out;
}

/**
 * Infos zu einem Artist: MusicBrainz → Wikidata → Wikipedia (de, sonst en) + Commons-Foto,
 * parallel dazu TheAudioDB (Bühnenbilder, Logo, deutsche Biografie) und Flickr (freie Konzertfotos).
 */
export async function lookupArtist(
  name: string,
  http: Http,
  signal?: AbortSignal,
  keys: SourceKeys = {},
): Promise<ArtistInfo | null> {
  const mb = await findArtist(name, http, signal);
  if (!mb) return null;
  let partial = false;
  const optional = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      partial = true;
      return fallback;
    }
  };

  const wikiPart = (async () => {
    const wd = mb.wikidataId ? await wikidataEntity(mb.wikidataId, http, signal) : {};
    const summary =
      (wd.dewiki ? await wikipediaSummary("de", wd.dewiki, http, signal) : null) ??
      (wd.enwiki ? await wikipediaSummary("en", wd.enwiki, http, signal) : null);
    const file = mb.imageFile ?? wd.image;
    const photo = file ? await optional(commonsImage(file, http, signal), null) : null;
    return { summary, photo };
  })();
  const audioKey = keys.audioDb === undefined ? AUDIODB_TEST_KEY : keys.audioDb;
  const [{ summary, photo }, adb, flickr] = await Promise.all([
    wikiPart,
    audioKey ? optional(audioDbArtist({ mbid: mb.mbid, name: mb.name }, http, audioKey, signal), null) : null,
    keys.flickr ? optional(flickrPhotos(mb.name, keys.flickr, http, signal), []) : [],
  ]);

  const photos: Array<Omit<Photo, "artistId">> = [
    ...(photo ? [{ ...photo, source: "commons" as const, kind: "photo" as const }] : []),
    ...(adb?.photos ?? []),
    ...flickr,
  ];
  const text =
    summary ?? (adb?.bioDe ? { text: adb.bioDe, url: `https://musicbrainz.org/artist/${mb.mbid}`, lang: "de" as const } : null);
  if (!text && !photos.length) return null;
  const facts = [...new Set([...factsFor(mb), ...(adb?.facts ?? [])])].slice(0, 4);
  return {
    name: mb.name,
    summary: text?.text ?? "",
    wikiUrl: text?.url ?? `https://musicbrainz.org/artist/${mb.mbid}`,
    lang: text?.lang ?? "de",
    textSource: summary ? "wikipedia" : "theaudiodb",
    facts,
    ...(adb?.logo ? { logo: adb.logo } : {}),
    photos,
    ...(partial ? { partial: true } : {}),
  };
}

export function createInfoService(deps: {
  cache: Cache;
  http: Http;
  keys?: SourceKeys;
  genius?: { token: string; fetch?: typeof fetch };
}) {
  /** Infos für alle Artists eines Songs (je Artist gecacht, nacheinander wegen der Ratenbegrenzung) und Song-Trivia. */
  return async function infoFor(
    artists: Array<{ id: string; name: string }>,
    signal?: AbortSignal,
    song?: { title: string },
  ): Promise<{ info: Info; complete: boolean }> {
    const info: Info = { artists: {}, photos: [] };
    let complete = true;
    for (const a of artists.slice(0, 5)) {
      const key = `info:v2:${normalizeLine(a.name)}`;
      let hit = await deps.cache.get<{ value: ArtistInfo | null }>(key);
      if (!hit) {
        try {
          const value = await lookupArtist(a.name, deps.http, signal, deps.keys);
          hit = { value };
          // fehlt eine optionale Quelle, nur kurz cachen (dann neuer Versuch)
          await deps.cache.set(key, hit, value && !value.partial ? CACHE_TTL.infoFound : CACHE_TTL.infoMissing);
        } catch (e) {
          // Überlastung/Netzfehler: nicht cachen, beim nächsten Song erneut versuchen
          complete = false;
          if (!(e instanceof SourceBusyError)) console.warn(`Info für ${a.name} fehlgeschlagen:`, (e as Error).message);
          continue;
        }
      }
      const v = hit.value;
      if (!v) continue;
      info.artists[a.id] = {
        name: v.name,
        summary: v.summary,
        wikiUrl: v.wikiUrl,
        lang: v.lang,
        facts: v.facts,
        ...(v.textSource !== "wikipedia" ? { textSource: v.textSource } : {}),
        ...(v.logo ? { logo: v.logo } : {}),
      };
      for (const p of v.photos) info.photos.push({ ...p, artistId: a.id });
    }

    // Song-Trivia von Genius (optional)
    const lead = artists[0];
    if (deps.genius && song && lead) {
      const key = `genius:v1:${normalizeLine(lead.name)}|${normalizeLine(song.title)}`;
      let hit = await deps.cache.get<{ value: { trivia: string[]; url: string } | null }>(key);
      if (!hit) {
        try {
          const value = await geniusTrivia(
            { title: song.title, artist: lead.name, artists: artists.map((x) => x.name) },
            deps.genius.token,
            deps.genius.fetch,
            signal,
          );
          hit = { value };
          await deps.cache.set(key, hit, value ? CACHE_TTL.infoFound : CACHE_TTL.infoMissing);
        } catch (e) {
          complete = false;
          console.warn("Genius fehlgeschlagen:", (e as Error).message);
        }
      }
      if (hit?.value?.trivia.length) info.song = { trivia: hit.value.trivia, url: hit.value.url };
    }

    // Wikipedia-Artikel zum Song (nur bekanntere Songs haben einen)
    if (song && lead) {
      const key = `songwiki:v1:${normalizeLine(lead.name)}|${normalizeLine(song.title)}`;
      let hit = await deps.cache.get<{ value: WikiSummary | null }>(key);
      if (!hit) {
        try {
          const value = await songArticle({ title: song.title, artist: lead.name }, deps.http, signal);
          hit = { value };
          await deps.cache.set(key, hit, value ? CACHE_TTL.infoFound : CACHE_TTL.infoMissing);
        } catch (e) {
          complete = false;
          if (!(e instanceof SourceBusyError)) console.warn("Wikipedia (Song) fehlgeschlagen:", (e as Error).message);
        }
      }
      if (hit?.value) info.song = { ...(info.song ?? { trivia: [] }), wiki: hit.value };
    }
    return { info, complete };
  };
}

let shared: ReturnType<typeof createInfoService> | undefined;

export function infoFor(artists: Array<{ id: string; name: string }>, signal?: AbortSignal, song?: { title: string }) {
  const env = process.env;
  shared ??= createInfoService({
    cache: getCache(),
    keys: {
      audioDb: env.THEAUDIODB_API_KEY === "0" ? null : env.THEAUDIODB_API_KEY || undefined,
      flickr: env.FLICKR_API_KEY || undefined,
    },
    ...(env.GENIUS_ACCESS_TOKEN ? { genius: { token: env.GENIUS_ACCESS_TOKEN } } : {}),
    // MusicBrainz erlaubt 1 Anfrage/s; Wikimedia großzügiger, drosselt Cloud-IPs aber schnell
    http: createPoliteFetch({
      minIntervalMs: {
        "musicbrainz.org": 1100,
        "www.wikidata.org": 250,
        "de.wikipedia.org": 250,
        "en.wikipedia.org": 250,
        "commons.wikimedia.org": 250,
        "www.theaudiodb.com": 2100, // kostenloser Zugang: 30 Anfragen/min
        "api.flickr.com": 500,
      },
    }),
  });
  return shared(artists, signal, song);
}
