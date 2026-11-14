/** Grobe Silbenschätzung über Vokalgruppen (DE/EN) – Grundlage der Wort-Timings. */
export function syllables(word: string): number {
  const groups = word.toLowerCase().match(/[aeiouyäöüàáâéèêíìîóòôúùû]+/g);
  return Math.max(groups?.length ?? 1, 1);
}

/** Normalisiert eine Zeile für Vergleiche (Refrain-Erkennung, Dubletten). */
export function normalizeLine(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\([^)]*\)/g, "") // Background-Vocals in Klammern ignorieren
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Für Track-Suche: „Titel - Remastered 2011“, „(feat. X)“ usw. entfernen. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+(?:.*remaster(?:ed)?.*|.*version|live.*|radio edit|single edit|mono|stereo)$/i, "")
    .trim();
}
