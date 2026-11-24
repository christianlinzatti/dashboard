import { spokenTitle } from "@/lib/show/announce";
import type { SongStatic } from "@/lib/song-context/schema";

/** höchstens so viele verschiedene Schilder (Kacheln in der Textur) */
export const SIGN_TILES = 8;
/** längere Texte passen nicht lesbar aufs Schild */
const MAX_LEN = 22;

/**
 * Was die Fans auf ihre Schilder schreiben: Künstlername mit Herz, Songtitel, Heimatort ♥ Künstler, „ZUGABE!“ …
 * Je Song gleich (Reihenfolge fest), höchstens acht verschiedene.
 */
export function signTexts(song: Pick<SongStatic, "artists" | "track"> & Partial<Pick<SongStatic, "concertArea">>): string[] {
  const lead = song.artists[0]?.name;
  if (!lead) return [];
  const feature = song.artists.find((a) => a.role === "feature")?.name;
  const title = spokenTitle(song.track.title);
  const city = song.concertArea?.name;
  const all = [
    `♥ ${lead} ♥`,
    lead.toUpperCase(),
    `„${title}“`,
    city ? `${city} ♥ ${lead}` : `Wir ♥ ${lead}`,
    "ZUGABE!",
    feature ? `${feature} ♥` : "♥ ♥ ♥",
    "BESTER ABEND!",
    "♥",
  ];
  return [...new Set(all.filter((t) => t.length <= MAX_LEN))].slice(0, SIGN_TILES);
}
