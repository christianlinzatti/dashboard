import { z } from "zod";
import { normalizeLine } from "@/lib/lyrics/text";
import type { Photo } from "@/lib/song-context/schema";
import { shorten } from "./wikimedia";

type Http = (url: string, signal?: AbortSignal) => Promise<Response>;

/** Öffentlicher Test-Key laut TheAudioDB-Doku; eigener Key über THEAUDIODB_API_KEY. */
export const AUDIODB_TEST_KEY = "123";

const str = z
  .string()
  .nullish()
  .transform((v) => (v ? v.trim() : undefined));
const artistSchema = z.object({
  strArtist: z.string(),
  strMusicBrainzID: str,
  intFormedYear: str,
  intMembers: str,
  strGenre: str,
  strStyle: str,
  strCountryCode: str,
  strBiographyDE: str,
  strArtistThumb: str,
  strArtistLogo: str,
  strArtistWideThumb: str,
  strArtistFanart: str,
  strArtistFanart2: str,
  strArtistFanart3: str,
  strArtistFanart4: str,
});
const responseSchema = z.object({ artists: z.array(artistSchema).nullable() });

export type AudioDbArtist = {
  bioDe?: string;
  facts: string[];
  logo?: string;
  photos: Array<Omit<Photo, "artistId">>;
};

const region = (code?: string) => {
  if (!code || !/^[A-Z]{2}$/.test(code)) return undefined;
  try {
    return new Intl.DisplayNames("de", { type: "region" }).of(code);
  } catch {
    return undefined;
  }
};

/** Bild-Formate laut TheAudioDB-Vorgaben (Fanart 16:9, Wide-Thumb ~16:9, Thumb quadratisch). */
const FORMATS = {
  fanart: { width: 1280, height: 720 },
  wide: { width: 1000, height: 562 },
  thumb: { width: 700, height: 700 },
} as const;

export function mapAudioDb(a: z.infer<typeof artistSchema>): AudioDbArtist {
  const credit = "TheAudioDB";
  const sourceUrl = `https://www.theaudiodb.com/artist/${encodeURIComponent(a.strArtist)}`;
  const photo = (url: string | undefined, kind: "fanart" | "wide" | "thumb") =>
    url
      ? [
          {
            url,
            ...FORMATS[kind],
            kind: kind === "thumb" ? ("thumb" as const) : ("fanart" as const),
            source: "theaudiodb" as const,
            credit,
            license: "TheAudioDB-Community",
            sourceUrl,
          },
        ]
      : [];
  const members = Number(a.intMembers);
  const country = region(a.strCountryCode);
  return {
    bioDe: a.strBiographyDE ? shorten(a.strBiographyDE) : undefined,
    facts: [
      ...(a.strGenre ? [a.strGenre] : a.strStyle ? [a.strStyle] : []),
      ...(members > 1 ? [`${members} Mitglieder`] : []),
      ...(country ? [`Herkunft: ${country}`] : []),
    ],
    logo: a.strArtistLogo,
    photos: [
      ...photo(a.strArtistFanart, "fanart"),
      ...photo(a.strArtistFanart2, "fanart"),
      ...photo(a.strArtistFanart3, "fanart"),
      ...photo(a.strArtistFanart4, "fanart"),
      ...photo(a.strArtistWideThumb, "wide"),
      ...photo(a.strArtistThumb, "thumb"),
    ],
  };
}

/**
 * Künstler bei TheAudioDB: per MusicBrainz-ID (eindeutig), sonst per Name mit exakter Prüfung.
 */
export async function audioDbArtist(
  q: { mbid?: string; name: string },
  http: Http,
  key = AUDIODB_TEST_KEY,
  signal?: AbortSignal,
): Promise<AudioDbArtist | null> {
  const base = `https://www.theaudiodb.com/api/v1/json/${encodeURIComponent(key)}`;
  const url = q.mbid
    ? `${base}/artist-mb.php?i=${encodeURIComponent(q.mbid)}`
    : `${base}/search.php?s=${encodeURIComponent(q.name)}`;
  const res = await http(url, signal);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TheAudioDB ${res.status}`);
  const list = responseSchema.parse(await res.json()).artists ?? [];
  const hit = q.mbid
    ? list.find((a) => a.strMusicBrainzID === q.mbid)
    : list.find((a) => normalizeLine(a.strArtist) === normalizeLine(q.name));
  return hit ? mapAudioDb(hit) : null;
}
