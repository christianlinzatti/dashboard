import "server-only";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import { normalizeLine } from "@/lib/lyrics/text";
import type { Info, Photo } from "@/lib/song-context/schema";
import { createPoliteFetch, SourceBusyError } from "./http";
import { findArtist, type MbArtist } from "./musicbrainz";
import { commonsImage, wikidataEntity, wikipediaSummary } from "./wikimedia";

type Http = (url: string, signal?: AbortSignal) => Promise<Response>;

export type ArtistInfo = {
  name: string;
  summary: string;
  wikiUrl: string;
  lang: "de" | "en";
  facts: string[];
  photo: Omit<Photo, "artistId"> | null;
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

/** Infos zu einem Artist: MusicBrainz → Wikidata → Wikipedia (de, sonst en) + Commons-Foto mit Lizenz. */
export async function lookupArtist(name: string, http: Http, signal?: AbortSignal): Promise<ArtistInfo | null> {
  const mb = await findArtist(name, http, signal);
  if (!mb) return null;
  const wd = mb.wikidataId ? await wikidataEntity(mb.wikidataId, http, signal) : {};
  const summary =
    (wd.dewiki ? await wikipediaSummary("de", wd.dewiki, http, signal) : null) ??
    (wd.enwiki ? await wikipediaSummary("en", wd.enwiki, http, signal) : null);
  const file = mb.imageFile ?? wd.image;
  const photo = file ? await commonsImage(file, http, signal).catch(() => null) : null;
  if (!summary && !photo) return null;
  return {
    name: mb.name,
    summary: summary?.text ?? "",
    wikiUrl: summary?.url ?? `https://musicbrainz.org/artist/${mb.mbid}`,
    lang: summary?.lang ?? "de",
    facts: factsFor(mb),
    photo,
  };
}

const TTL_FOUND = 7 * 24 * 3600;
const TTL_MISSING = 24 * 3600;

export function createInfoService(deps: { cache: Cache; http: Http }) {
  /** Infos für alle Artists eines Songs (je Artist gecacht, nacheinander wegen der Ratenbegrenzung). */
  return async function infoFor(
    artists: Array<{ id: string; name: string }>,
    signal?: AbortSignal,
  ): Promise<{ info: Info; complete: boolean }> {
    const info: Info = { artists: {}, photos: [] };
    let complete = true;
    for (const a of artists.slice(0, 5)) {
      const key = `info:v1:${normalizeLine(a.name)}`;
      let hit = await deps.cache.get<{ value: ArtistInfo | null }>(key);
      if (!hit) {
        try {
          const value = await lookupArtist(a.name, deps.http, signal);
          hit = { value };
          await deps.cache.set(key, hit, value ? TTL_FOUND : TTL_MISSING);
        } catch (e) {
          // Überlastung/Netzfehler: nicht cachen, beim nächsten Song erneut versuchen
          complete = false;
          if (!(e instanceof SourceBusyError)) console.warn(`Info für ${a.name} fehlgeschlagen:`, (e as Error).message);
          continue;
        }
      }
      const v = hit.value;
      if (!v) continue;
      info.artists[a.id] = { name: v.name, summary: v.summary, wikiUrl: v.wikiUrl, lang: v.lang, facts: v.facts };
      if (v.photo) info.photos.push({ ...v.photo, artistId: a.id });
    }
    return { info, complete };
  };
}

let shared: ReturnType<typeof createInfoService> | undefined;

export function infoFor(artists: Array<{ id: string; name: string }>, signal?: AbortSignal) {
  shared ??= createInfoService({
    cache: getCache(),
    // MusicBrainz erlaubt 1 Anfrage/s; Wikimedia großzügiger, drosselt Cloud-IPs aber schnell
    http: createPoliteFetch({
      minIntervalMs: {
        "musicbrainz.org": 1100,
        "www.wikidata.org": 250,
        "de.wikipedia.org": 250,
        "en.wikipedia.org": 250,
        "commons.wikimedia.org": 250,
      },
    }),
  });
  return shared(artists, signal);
}
