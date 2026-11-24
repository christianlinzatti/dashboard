import type { LyricLine, LyricWord, Lyrics } from "@/lib/song-context/schema";

/** Zweite Zeile unter dem Liedtext: automatisch, Umschrift, Übersetzung oder aus. */
export const secondLineModes = ["auto", "umschrift", "uebersetzung", "aus"] as const;
export type SecondLineMode = (typeof secondLineModes)[number];

export const secondLineLabel: Record<SecondLineMode, string> = {
  auto: "automatisch",
  umschrift: "Umschrift",
  uebersetzung: "Übersetzung",
  aus: "aus",
};

/** Text in nicht-lateinischer Schrift (Japanisch, Chinesisch, Koreanisch, Kyrillisch, Griechisch, Arabisch …)? */
export function isNonLatin(text: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Thai}\p{Script=Devanagari}]/u.test(
    text,
  );
}

const STOP = {
  de: new Set(
    "ich du und der die das nicht ist mir mich dich wir ein eine sie es zu mit auf für noch nur wenn wie was".split(" "),
  ),
  en: new Set("i you the and to me my it is your in we that on of don't i'm can be all for love".split(" ")),
};

type Lang = "de" | "en" | "anders" | "unbekannt";
const langCache = new WeakMap<object, Lang>();

/**
 * Sprache des Liedtexts grob schätzen (Anteil häufiger deutscher bzw. englischer Wörter) – reicht für die Frage, ob
 * eine englische Übersetzung hilft: bei Deutsch und Englisch nein, bei Spanisch, Italienisch, Französisch … ja.
 */
export function guessLyricsLang(lines: ReadonlyArray<Pick<LyricLine, "text">>): Lang {
  // fremde Schrift (Japanisch, Koreanisch, Kyrillisch …): weder deutsch noch englisch
  const filled = lines.filter((l) => l.text.trim());
  if (filled.length >= 4 && filled.filter((l) => isNonLatin(l.text)).length * 2 >= filled.length) return "anders";
  const words = lines.flatMap((l) => l.text.toLowerCase().match(/[\p{L}']+/gu) ?? []);
  if (words.length < 30) return "unbekannt"; // zu wenig Text für eine Schätzung
  const share = (set: Set<string>) => words.filter((w) => set.has(w)).length / words.length;
  const de = share(STOP.de);
  const en = share(STOP.en);
  if (Math.max(de, en) < 0.08) return "anders";
  return de >= en ? "de" : "en";
}

function lyricsLang(lyrics: object & { lines?: ReadonlyArray<Pick<LyricLine, "text">> }): Lang {
  if (!lyrics.lines) return "unbekannt";
  let lang = langCache.get(lyrics);
  if (!lang) langCache.set(lyrics, (lang = guessLyricsLang(lyrics.lines)));
  return lang;
}

export type SecondLine = {
  kind: "umschrift" | "uebersetzung";
  text: string;
  words?: LyricWord[];
  lang?: string;
  /** maschinell übersetzt (KI) – wird so gekennzeichnet */
  machine?: boolean;
};

/**
 * Was unter der Zeile steht:
 * - automatisch: Umschrift bei nicht-lateinischer Schrift, sonst eine deutsche Übersetzung (falls vorhanden), eine
 *   englische nur bei Songs, die weder deutsch noch englisch sind
 * - Umschrift / Übersetzung: erzwungen (Übersetzung in jeder Sprache)
 */
export function secondLineFor(
  lyrics: Pick<Lyrics, "transliterationLang" | "translationLang" | "translationSource"> & { lines?: Lyrics["lines"] },
  line: LyricLine,
  mode: SecondLineMode,
): SecondLine | null {
  const translit: SecondLine | null = line.transliteration
    ? { kind: "umschrift", text: line.transliteration.text, words: line.transliteration.words, lang: lyrics.transliterationLang }
    : null;
  const transl: SecondLine | null = line.translation
    ? {
        kind: "uebersetzung",
        text: line.translation,
        lang: lyrics.translationLang,
        ...(lyrics.translationSource === "ki" ? { machine: true } : {}),
      }
    : null;
  switch (mode) {
    case "aus":
      return null;
    case "umschrift":
      return translit;
    case "uebersetzung":
      return transl;
    default:
      if (translit && isNonLatin(line.text)) return translit;
      if (!transl) return null;
      if (lyrics.translationLang?.toLowerCase().startsWith("de")) return transl;
      // englische Übersetzung, wenn der Song weder deutsch noch englisch ist (Spanisch, Italienisch, Koreanisch …)
      return lyrics.translationLang?.toLowerCase().startsWith("en") && lyricsLang(lyrics) === "anders" ? transl : null;
  }
}

/** Hat der Song überhaupt Umschrift oder Übersetzung? (Schalter nur dann anzeigen) */
export function hasSecondLine(lyrics: Lyrics | undefined): boolean {
  return !!lyrics?.lines.some((l) => l.transliteration || l.translation);
}

/** Füllstand jedes Worts der zweiten Zeile zur Zeit t (0..1); ohne Wort-Timing über die ganze Zeile. */
export function secondLineFill(line: LyricLine, second: SecondLine, t: number): number[] {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  if (second.words?.length) return second.words.map((w) => clamp((t - w.startMs) / Math.max(w.endMs - w.startMs, 1)));
  return [clamp((t - line.startMs) / Math.max(line.endMs - line.startMs, 1))];
}

/** Mindestzahl an Zeilen, damit sich eine Übersetzung lohnt (sonst eher Instrumental mit Zwischenruf) */
const TRANSLATE_MIN_LINES = 4;

/**
 * Braucht der Song eine deutsche Übersetzung? Nur wenn er nicht deutsch ist (geschätzt aus dem Text) und noch keine
 * deutsche dabei ist. Englisch zählt mit – übersetzt wird alles außer Deutsch.
 */
export function needsGermanTranslation(lyrics: Pick<Lyrics, "lines" | "translationLang"> | null | undefined): boolean {
  if (!lyrics || lyrics.translationLang?.toLowerCase().startsWith("de")) return false;
  if (lyrics.lines.filter((l) => l.text.trim()).length < TRANSLATE_MIN_LINES) return false;
  const lang = guessLyricsLang(lyrics.lines);
  return lang === "en" || lang === "anders";
}
