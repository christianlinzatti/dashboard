import { hash } from "@/lib/avatars/casting";
import type { SongStatic } from "@/lib/song-context/schema";
import type { ThemeId } from "./themes";

/**
 * Wetter auf Freiluftbühnen: Regen und Schnee. Deterministisch aus Song, Bühne und Datum – derselbe Song sieht am
 * selben Tag gleich aus (Tagesform wie bei der übrigen Regie).
 *
 * - Schnee: Winter-/Weihnachtssongs (Titel, Genres) und im Dezember/Januar ab und zu auf Festival und Stadion
 * - Regen: Songs über Regen, Sturm, Tränen; ruhige Songs auf Festival/Stadion gelegentlich
 * - Strand: kein Schnee; überdachte Bühnen (Club, Jazz, Lagerhalle, Kathedrale) und Weltraum: nie Wetter
 */
export type Weather = "regen" | "schnee" | null;

const OPEN_AIR: ReadonlySet<ThemeId> = new Set(["festival", "stadion", "strand", "synthwave"]);
const SNOW_WORDS = /christmas|xmas|weihnacht|winter|snow|schnee|jingle|frost|frozen|\bice\b|\beis\b|december|dezember|sleigh/i;
const RAIN_WORDS = /\brain|regen|storm|sturm|thunder|gewitter|umbrella|tears|tränen|\bgrey\b|\bgrau\b|november/i;

type WeatherSong = Pick<SongStatic, "trackKey" | "track" | "music"> & Partial<Pick<SongStatic, "variant" | "show">>;

export function weatherFor(song: WeatherSong, theme: ThemeId, today: string): Weather {
  if (!OPEN_AIR.has(theme)) return null;
  const text = [song.track.title, ...song.music.genres].join(" ");
  const roll = hash(`${song.trackKey}:wetter:${song.variant ?? ""}:${today}`) % 12;
  const month = Number(today.slice(5, 7));
  const winter = month === 12 || month === 1;
  if (theme !== "strand" && SNOW_WORDS.test(text)) return "schnee";
  if (RAIN_WORDS.test(text)) return "regen";
  if (theme === "strand" || theme === "synthwave") return null;
  if (winter && roll < 4) return "schnee";
  const mood = song.show?.mood ?? song.music.mood;
  if (mood === "ruhig" && roll < 3) return "regen";
  return null;
}
