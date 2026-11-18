import { hash } from "@/lib/avatars/casting";
import type { SongStatic } from "@/lib/song-context/schema";

/**
 * Motto der Show: ein kurzer Satz zum Songstart (Einblendung, Übergang, Alexa). Die KI-Regie schreibt es passend zum
 * Song; ohne KI entsteht eins aus Stimmung und Titel (stabil je Song und Tagesform).
 */
const TEMPLATES: Record<"energetisch" | "ruhig" | "mittel", string[]> = {
  energetisch: [
    "Alle Hände hoch für „{t}“",
    "Heute Nacht wird gefeiert: „{t}“",
    "Volle Energie – „{t}“",
    "Die Bühne bebt: „{t}“",
    "Lauter, höher, „{t}“",
  ],
  ruhig: ["Lichter an, Herzen auf: „{t}“", "Ganz nah dran – „{t}“", "Ein leiser Moment: „{t}“", "Tausend Lichter für „{t}“"],
  mittel: ["Bühne frei für „{t}“", "Auf geht's: „{t}“", "Jetzt kommt „{t}“", "Mitsingen erlaubt: „{t}“"],
};

type MottoSong = Pick<SongStatic, "trackKey" | "track" | "music"> & Partial<Pick<SongStatic, "show" | "variant">>;

export function mottoFor(song: MottoSong): string {
  const ai = song.show?.motto?.trim();
  if (ai) return ai;
  const mood = song.show?.mood ?? song.music.mood ?? "mittel";
  const list = TEMPLATES[mood];
  const title = song.track.title.replace(/\s*[([].*?(remaster|version|edit|mix|live|feat).*?[)\]]/gi, "").trim();
  return list[hash(`${song.trackKey}:motto:${song.variant ?? ""}`) % list.length]!.replace("{t}", title || song.track.title);
}
