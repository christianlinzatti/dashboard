import { hash } from "@/lib/avatars/casting";
import type { Lyrics, SongStatic } from "@/lib/song-context/schema";

/**
 * Inhalte der LED-Wand: In lauten Abschnitten läuft ein Muster passend zum Genre (Equalizer, Tunnel, Plasma,
 * Wellen), im Refrain blinkt dazu das Schlagwort des Refrains groß auf – wie bei echten Konzertvisuals.
 */
export const wallPatterns = ["equalizer", "tunnel", "plasma", "wellen"] as const;
export type WallPattern = (typeof wallPatterns)[number];

const GENRE_PATTERN: Array<[RegExp, WallPattern]> = [
  [/techno|house|edm|electro|trance|dubstep|drum|bass|industrial|hard ?style|minimal|acid/i, "tunnel"],
  [/hip ?hop|rap|trap|grime|r&b|rnb/i, "equalizer"],
  [/synth|disco|dance|k-?pop|j-?pop|funk|pop/i, "plasma"],
  [/rock|metal|punk|grunge|indie|alternative|emo|hardcore/i, "wellen"],
];

type WallSong = Pick<SongStatic, "trackKey" | "music"> & Partial<Pick<SongStatic, "variant" | "show">>;

export function wallPattern(song: WallSong): WallPattern {
  const genres = [...(song.show?.genres ?? []), ...song.music.genres];
  for (const [re, p] of GENRE_PATTERN) if (genres.some((g) => re.test(g))) return p;
  return wallPatterns[hash(`${song.trackKey}:wand:${song.variant ?? ""}`) % wallPatterns.length]!;
}

/** Füllwörter, die nie Schlagwort werden (deutsch und englisch) */
const STOP = new Set(
  (
    "aber alle allem allen aller alles also auch auf aus bei beim bin bis bist dann das dass dein deine dem den denn der des " +
    "dich die dies diese dieser dir doch dort durch ein eine einem einen einer eines euch euer für hab habe haben hat hatte " +
    "hier hin ich ihr ihre immer ist jetzt kann kein keine mal man mehr mein meine mich mir mit nach nicht noch nur oder ohne " +
    "sehr sein seine sich sie sind so über uns und unser unter vom von vor war was weil wenn wer wie wieder will wir wird wo zu " +
    "zum zur einfach heute ganz gibt geht gehen machen macht schon " +
    "about after again all also and are been but can cause could did does don't down each from get got have her here him his " +
    "how into it's just know let like make more never now off once only other our out over said she should some that the " +
    "their them then there these they this those through too under until very want was way well were what when where which " +
    "while who will with won't would yeah you your you're i'm can't ain't gonna wanna gotta baby ooh oh"
  ).split(/\s+/),
);

const WORD = /[\p{L}][\p{L}'’-]*/gu;
const MIN_LEN = 4;
const MAX_LEN = 14;

/**
 * Schlagwort des Refrains: das häufigste aussagekräftige Wort in den Refrain-Zeilen (ohne Abschnitte: in Zeilen, die
 * sich wiederholen). Großgeschrieben für die Wand; null, wenn nichts taugt (z. B. Schriften ohne Wortgrenzen).
 */
export function chorusKeyword(lyrics: Pick<Lyrics, "lines" | "sections"> | null | undefined): string | null {
  if (!lyrics?.lines.length) return null;
  const chorus = lyrics.sections.filter((s) => s.kind === "chorus");
  let lines = chorus.length
    ? lyrics.lines.filter((l) => chorus.some((s) => l.startMs >= s.startMs && l.startMs < s.endMs)).map((l) => l.text)
    : [];
  if (!lines.length) {
    const seen = new Map<string, number>();
    for (const l of lyrics.lines) seen.set(l.text.trim().toLowerCase(), (seen.get(l.text.trim().toLowerCase()) ?? 0) + 1);
    lines = lyrics.lines.map((l) => l.text).filter((t) => (seen.get(t.trim().toLowerCase()) ?? 0) >= 2);
  }
  const count = new Map<string, { n: number; first: number; shown: string }>();
  let i = 0;
  for (const text of lines)
    for (const m of text.matchAll(WORD)) {
      const word = m[0].replace(/['’-]+$/, "");
      const key = word.toLowerCase();
      if (word.length < MIN_LEN || word.length > MAX_LEN || STOP.has(key)) continue;
      const c = count.get(key);
      if (c) c.n++;
      else count.set(key, { n: 1, first: i++, shown: word });
    }
  const best = [...count.values()].sort((a, b) => b.n - a.n || b.shown.length - a.shown.length || a.first - b.first)[0];
  return best ? best.shown.toLocaleUpperCase("de-DE") : null;
}

/** Im Refrain: zwei Takte Schlagwort, zwei Takte Muster (im Wechsel, taktgenau) */
export function keywordShown(positionMs: number, bpm: number, isChorus: boolean): boolean {
  if (!isChorus || !(bpm > 0)) return false;
  const barMs = (60_000 / bpm) * 4;
  return Math.floor(positionMs / (barMs * 2)) % 2 === 0;
}

/** Demo und Screenshots: Muster per ?wand=tunnel|plasma|wellen|equalizer festlegen */
export function forcedWallPattern(search: string | undefined = typeof location === "undefined" ? undefined : location.search) {
  const v = search ? new URLSearchParams(search).get("wand") : null;
  return (wallPatterns as readonly string[]).includes(v ?? "") ? (v as WallPattern) : undefined;
}
