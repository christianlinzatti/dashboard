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

export type SecondLine = { kind: "umschrift" | "uebersetzung"; text: string; words?: LyricWord[]; lang?: string };

/**
 * Was unter der Zeile steht:
 * - automatisch: Umschrift bei nicht-lateinischer Schrift, sonst eine deutsche Übersetzung (falls vorhanden)
 * - Umschrift / Übersetzung: erzwungen (Übersetzung in jeder Sprache)
 */
export function secondLineFor(
  lyrics: Pick<Lyrics, "transliterationLang" | "translationLang">,
  line: LyricLine,
  mode: SecondLineMode,
): SecondLine | null {
  const translit: SecondLine | null = line.transliteration
    ? { kind: "umschrift", text: line.transliteration.text, words: line.transliteration.words, lang: lyrics.transliterationLang }
    : null;
  const transl: SecondLine | null = line.translation
    ? { kind: "uebersetzung", text: line.translation, lang: lyrics.translationLang }
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
      return transl && lyrics.translationLang?.toLowerCase().startsWith("de") ? transl : null;
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
