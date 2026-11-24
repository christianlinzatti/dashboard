import type { Lyrics } from "@/lib/song-context/schema";

/**
 * Deutsche KI-Übersetzung in den Liedtext einsetzen (je Zeilentext, damit Zeilen mit gleichem Text dieselbe Übersetzung
 * bekommen). Ersetzt eine mitgelieferte fremdsprachige Übersetzung; Zeilen ohne Übersetzung bleiben unverändert.
 */
export function applyGermanTranslation(lyrics: Lyrics, byText: Readonly<Record<string, string>>): Lyrics {
  return {
    ...lyrics,
    lines: lyrics.lines.map((l) => {
      const t = byText[l.text.trim()]?.trim();
      return t ? { ...l, translation: t } : { ...l, translation: undefined };
    }),
    translationLang: "de",
    translationSource: "ki",
  };
}
