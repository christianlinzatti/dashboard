import { describe, expect, it, vi } from "vitest";
import { plain, songArticle } from "@/lib/info/song-wiki";
import { CARD_ROTATE_MS, infoCardAt } from "@/lib/info/display";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const summary = (title: string, extract: string, lang = "de") => ({
  type: "standard",
  extract,
  content_urls: { desktop: { page: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` } },
});

/** Nachgebildetes Wikipedia: Suche und Zusammenfassungen je Sprache */
function wiki(pages: Record<string, { hits: string[]; summaries: Record<string, string> }>) {
  return vi.fn(async (url: string) => {
    const u = new URL(url);
    const lang = u.hostname.split(".")[0]!;
    const p = pages[lang] ?? { hits: [], summaries: {} };
    if (u.pathname === "/w/api.php") return json({ query: { search: p.hits.map((title) => ({ title })) } });
    const title = decodeURIComponent(u.pathname.split("/").pop()!).replace(/_/g, " ");
    const text = p.summaries[title];
    return text ? json(summary(title, text, lang)) : new Response("", { status: 404 });
  });
}

describe("Wikipedia-Artikel zum Song", () => {
  it("nimmt den Artikel, wenn Titel, Künstler und Musikstück passen (Klammerzusatz egal)", async () => {
    const http = wiki({
      de: {
        hits: ["The Police", "Roxanne (Lied)", "Roxanne (Film)"],
        summaries: {
          "Roxanne (Lied)": "Roxanne ist ein Lied der britischen Band The Police aus dem Jahr 1978.",
          "Roxanne (Film)": "Roxanne ist eine Filmkomödie aus dem Jahr 1987.",
        },
      },
    });
    const r = await songArticle({ title: "Roxanne - Remastered 2003", artist: "The Police" }, http);
    // Remaster-Zusatz ohne Klammer bleibt Teil des Titels → kein Treffer; mit sauberem Titel schon
    expect(r).toBeNull();
    const ok = await songArticle({ title: "Roxanne", artist: "The Police" }, http);
    expect(ok).toMatchObject({ lang: "de", url: expect.stringContaining("Roxanne") });
    expect(ok!.text).toContain("Lied der britischen Band");
  });

  it("verwirft fremde Artikel: anderer Künstler, kein Musikstück, anderer Titel", async () => {
    const http = wiki({
      de: {
        hits: ["Neonlicht", "Neonlicht (Lied)"],
        summaries: {
          Neonlicht: "Neonlicht ist eine Leuchtröhre, die mit Neon gefüllt ist.",
          "Neonlicht (Lied)": "Neonlicht ist ein Lied der Band Kraftwerk.",
        },
      },
      en: { hits: ["Neon light"], summaries: { "Neon light": "A neon light is a song by Mira Sol." } },
    });
    expect(await songArticle({ title: "Neonlicht", artist: "Mira Sol" }, http)).toBeNull();
  });

  it("englisch als Rückfall; ohne Treffer null", async () => {
    const http = wiki({
      de: { hits: [], summaries: {} },
      en: {
        hits: ["Bohemian Rhapsody"],
        summaries: { "Bohemian Rhapsody": "Bohemian Rhapsody is a song by the British rock band Queen, released in 1975." },
      },
    });
    expect(await songArticle({ title: "Bohemian Rhapsody", artist: "Queen" }, http)).toMatchObject({ lang: "en" });
    expect(await songArticle({ title: "BDU", artist: "Trailerpark" }, wiki({}))).toBeNull();
  });

  it("Vergleich ohne Akzente, Satzzeichen und Klammerzusätze", () => {
    expect(plain("Ça plane pour moi (Lied)")).toBe("ca plane pour moi");
    expect(plain("Hämatom")).toBe("hamatom");
  });

  it("Infokarte: der Song-Artikel läuft als eigene Karte mit, vor den Künstlern", () => {
    const wikiText = "Neonlicht ist ein Lied von Mira Sol.";
    const song = {
      ...neonlicht,
      info: {
        ...neonlicht.info!,
        song: {
          trivia: ["Produziert von Demo"],
          wiki: { text: wikiText, url: "https://de.wikipedia.org/wiki/Neonlicht", lang: "de" as const },
        },
      },
    };
    const intro = {
      lineIdx: -1,
      lineActive: false,
      wordIdx: -1,
      wordProgress: 0,
      section: "intro" as const,
      isChorus: false,
      secondsToNextLyric: 20,
    };
    const cards = [0, 1, 2, 3].map((i) => infoCardAt(song, intro, i * CARD_ROTATE_MS + 1000));
    const own = cards.find((c) => c?.id === "song")!;
    expect(own.name).toBe("„Neonlicht“");
    expect(own.summary).toBe(wikiText);
    expect(own.facts).toEqual(["Produziert von Demo"]);
    expect(cards.some((c) => c && c.id !== "song")).toBe(true);
  });
});
