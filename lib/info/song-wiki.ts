import { z } from "zod";
import { wikipediaSummary, type WikiSummary } from "./wikimedia";

type Http = (url: string, signal?: AbortSignal) => Promise<Response>;

const searchSchema = z.object({
  query: z.object({ search: z.array(z.object({ title: z.string() })) }).optional(),
});

/** Für Vergleiche: klein, ohne Akzente, Satzzeichen und Klammerzusätze („Roxanne (Lied)“ → „roxanne“) */
export function plain(s: string): string {
  return s
    .replace(/\s*[([].*?[)\]]/g, "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("de-DE")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** So erkennt man einen Artikel über ein Musikstück (de/en) */
const SONG_WORDS = /\b(lied|song|single|titel|track|ballade|hymne|stück)\b/i;

/**
 * Wikipedia-Artikel über den Song selbst (deutsch zuerst, sonst englisch). Streng geprüft, damit kein fremder
 * Artikel erscheint: Seitentitel = Songtitel (ohne Klammerzusatz), der Text nennt den Künstler und beschreibt ein
 * Musikstück. Liefert null, wenn es keinen passenden Artikel gibt.
 */
export async function songArticle(
  song: { title: string; artist: string },
  http: Http,
  signal?: AbortSignal,
): Promise<WikiSummary | null> {
  const title = plain(song.title);
  const artist = plain(song.artist);
  if (!title || !artist) return null;
  for (const lang of ["de", "en"] as const) {
    const q = new URLSearchParams({
      action: "query",
      list: "search",
      srsearch: `${song.title} ${song.artist}`,
      srlimit: "5",
      format: "json",
      origin: "*",
    });
    const res = await http(`https://${lang}.wikipedia.org/w/api.php?${q}`, signal);
    if (!res.ok) throw new Error(`Wikipedia-Suche ${res.status}`);
    const hits = searchSchema.parse(await res.json()).query?.search ?? [];
    for (const h of hits.filter((x) => plain(x.title) === title).slice(0, 2)) {
      const s = await wikipediaSummary(lang, h.title, http, signal);
      if (!s) continue;
      const text = plain(s.text);
      if (text.includes(artist) && SONG_WORDS.test(s.text)) return s;
    }
  }
  return null;
}
