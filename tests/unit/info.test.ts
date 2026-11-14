import { describe, expect, it, vi } from "vitest";
import { createPoliteFetch, SourceBusyError } from "@/lib/info/http";
import { findArtist } from "@/lib/info/musicbrainz";
import { commonsImage, shorten, stripHtml, wikidataEntity, wikipediaSummary } from "@/lib/info/wikimedia";
import { createInfoService, factsFor, lookupArtist } from "@/lib/info/service";
import { memoryCache } from "@/lib/lyrics/cache";
import { infoSchema } from "@/lib/song-context/schema";

/** Antworten im echten Format (Nov. 2026 geprüft), Inhalte gekürzt/erfunden. */
const MBID = "167e1cd2-4a9e-4f34-bcda-2e0acf0a1797";
const responses: Record<string, unknown> = {
  "musicbrainz.org/ws/2/artist?": {
    created: "2026-11-14T19:18:21.009Z",
    count: 2,
    artists: [
      { id: "x-cover", name: "Helene Fischer Tribute", score: 95, type: "Group" },
      { id: MBID, name: "Helene Fischer", score: 100, type: "Person", aliases: [{ name: "H. Fischer" }] },
    ],
  },
  [`musicbrainz.org/ws/2/artist/${MBID}`]: {
    id: MBID,
    name: "Helene Fischer",
    type: "Person",
    "life-span": { begin: "1984-08-05", end: null, ended: false },
    relations: [
      { type: "image", url: { resource: "https://commons.wikimedia.org/wiki/File:Helene-Fischer-Schleyerhalle.jpg" } },
      { type: "wikidata", url: { resource: "https://www.wikidata.org/wiki/Q236549" } },
      { type: "official homepage", url: { resource: "https://example.org" } },
    ],
  },
  "www.wikidata.org/wiki/Special:EntityData/Q236549.json": {
    entities: {
      Q236549: {
        sitelinks: { dewiki: { title: "Helene Fischer" }, enwiki: { title: "Helene Fischer" } },
        claims: { P18: [{ mainsnak: { datavalue: { value: "Anderes Bild.jpg", type: "string" } } }] },
      },
    },
  },
  "de.wikipedia.org/api/rest_v1/page/summary/Helene_Fischer": {
    type: "standard",
    title: "Helene Fischer",
    extract: "Helene Fischer ist eine Sängerin. Sie ist sehr erfolgreich. ".repeat(10),
    content_urls: { desktop: { page: "https://de.wikipedia.org/wiki/Helene_Fischer" } },
  },
  "commons.wikimedia.org/w/api.php": {
    batchcomplete: true,
    query: {
      pages: [
        {
          title: "File:Helene-Fischer-Schleyerhalle.jpg",
          imageinfo: [
            {
              thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/x.jpg/1280px-x.jpg",
              thumbwidth: 1280,
              thumbheight: 960,
              url: "https://upload.wikimedia.org/wikipedia/commons/8/87/x.jpg",
              descriptionurl: "https://commons.wikimedia.org/wiki/File:Helene-Fischer-Schleyerhalle.jpg",
              extmetadata: {
                Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:FK">Fred Kuhles</a>', source: "commons-desc-page" },
                LicenseShortName: { value: "CC BY-SA 3.0", source: "commons-desc-page" },
                Credit: { value: "Own work", source: "commons-desc-page" },
              },
            },
          ],
        },
      ],
    },
  },
};

function fakeHttp(overrides: Record<string, unknown> = {}) {
  const all = { ...responses, ...overrides };
  const calls: string[] = [];
  const http = vi.fn(async (url: string) => {
    calls.push(url);
    const key = Object.keys(all)
      .filter((k) => url.includes(k))
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response("nicht gefunden", { status: 404 });
    const v = all[key];
    return v instanceof Response ? v : Response.json(v);
  });
  return { http, calls };
}

describe("MusicBrainz", () => {
  it("findet den richtigen Artist (Name statt Tribute-Band) und liest Beziehungen", async () => {
    const { http } = fakeHttp();
    expect(await findArtist("Helene Fischer", http)).toEqual({
      mbid: MBID,
      name: "Helene Fischer",
      type: "Person",
      begin: "1984-08-05",
      end: undefined,
      wikidataId: "Q236549",
      imageFile: "Helene-Fischer-Schleyerhalle.jpg",
    });
  });

  it("kein sicherer Treffer → null; Überlastmeldung im 200-Body → Fehler", async () => {
    expect(
      await findArtist(
        "Unbekannt",
        fakeHttp({ "musicbrainz.org/ws/2/artist?": { artists: [{ id: "a", name: "Anders", score: 99 }] } }).http,
      ),
    ).toBeNull();
    const busy = fakeHttp({ "musicbrainz.org/ws/2/artist?": { error: "The MusicBrainz web server is currently busy." } });
    await expect(findArtist("Helene Fischer", busy.http)).rejects.toBeInstanceOf(SourceBusyError);
  });
});

describe("Wikimedia", () => {
  it("Wikidata: Wikipedia-Titel und Bild", async () => {
    expect(await wikidataEntity("Q236549", fakeHttp().http)).toEqual({
      dewiki: "Helene Fischer",
      enwiki: "Helene Fischer",
      image: "Anderes Bild.jpg",
    });
  });

  it("Wikipedia: gekürzt an Satzgrenze; Begriffsklärung → null", async () => {
    const s = await wikipediaSummary("de", "Helene Fischer", fakeHttp().http);
    expect(s!.text.length).toBeLessThanOrEqual(320);
    expect(s!.text.endsWith(".")).toBe(true);
    expect(s!.lang).toBe("de");
    const disamb = fakeHttp({
      "de.wikipedia.org/api/rest_v1/page/summary/Queen": {
        type: "disambiguation",
        extract: "x",
        content_urls: { desktop: { page: "u" } },
      },
    });
    expect(await wikipediaSummary("de", "Queen", disamb.http)).toBeNull();
    expect(await wikipediaSummary("de", "Gibtsnicht", fakeHttp().http)).toBeNull();
  });

  it("Commons: Urheber ohne HTML, freie Lizenz; unfreie Lizenz → nicht anzeigen", async () => {
    expect(await commonsImage("Helene-Fischer-Schleyerhalle.jpg", fakeHttp().http)).toEqual({
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/x.jpg/1280px-x.jpg",
      width: 1280,
      height: 960,
      credit: "Fred Kuhles",
      license: "CC BY-SA 3.0",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Helene-Fischer-Schleyerhalle.jpg",
    });
    const unfree = structuredClone(responses["commons.wikimedia.org/w/api.php"]) as {
      query: { pages: Array<{ imageinfo: Array<{ extmetadata: Record<string, { value: string }> }> }> };
    };
    unfree.query.pages[0]!.imageinfo[0]!.extmetadata.LicenseShortName = { value: "Fair use" };
    expect(await commonsImage("x.jpg", fakeHttp({ "commons.wikimedia.org/w/api.php": unfree }).http)).toBeNull();
  });

  it("Hilfsfunktionen", () => {
    expect(stripHtml('<a href="x">A &amp; B</a>&nbsp;')).toBe("A & B");
    expect(shorten("Kurz.")).toBe("Kurz.");
    expect(shorten("x".repeat(400)).endsWith(" …") || shorten("x".repeat(400)).length <= 322).toBe(true);
  });
});

describe("Info-Service", () => {
  it("setzt alles zusammen; MusicBrainz-Bild hat Vorrang vor Wikidata", async () => {
    const info = await lookupArtist("Helene Fischer", fakeHttp().http);
    expect(info).toMatchObject({
      name: "Helene Fischer",
      lang: "de",
      textSource: "wikipedia",
      facts: ["Geboren 1984"],
      photos: [{ credit: "Fred Kuhles", source: "commons", kind: "photo" }],
    });
    expect(info).not.toHaveProperty("partial"); // TheAudioDB kennt sie nicht (404) – kein Ausfall
  });

  it("Fakten für Bands", () => {
    expect(factsFor({ type: "Group", begin: "1970", end: "1991-11-24" })).toEqual(["Gegründet 1970", "Aufgelöst 1991"]);
    expect(factsFor({ type: "Other" })).toEqual([]);
  });

  it("cacht Treffer, cacht keine Überlastung, liefert gültiges Info-Objekt", async () => {
    const ok = fakeHttp();
    const svc = createInfoService({ cache: memoryCache(), http: ok.http });
    const r = await svc([{ id: "sp1", name: "Helene Fischer" }]);
    expect(r.complete).toBe(true);
    expect(() => infoSchema.parse(r.info)).not.toThrow();
    expect(r.info.photos[0]!.artistId).toBe("sp1");
    const n = ok.calls.length;
    await svc([{ id: "sp1", name: "Helene Fischer" }]);
    expect(ok.calls.length).toBe(n); // aus dem Cache

    const busy = fakeHttp({ "musicbrainz.org/ws/2/artist?": { error: "busy" } });
    const svc2 = createInfoService({ cache: memoryCache(), http: busy.http });
    expect((await svc2([{ id: "a", name: "X" }])).complete).toBe(false);
    await svc2([{ id: "a", name: "X" }]);
    expect(busy.calls.filter((c) => c.includes("/artist?")).length).toBe(2); // nicht gecacht
  });
});

describe("Höflicher HTTP-Client", () => {
  it("hält den Mindestabstand je Host ein und versucht 429 genau einmal neu", async () => {
    const waits: number[] = [];
    let n = 0;
    const f = vi.fn<typeof fetch>(async () =>
      ++n === 1 ? new Response("", { status: 429, headers: { "retry-after": "2" } }) : Response.json({ ok: 1 }),
    );
    const http = createPoliteFetch({ minIntervalMs: { "a.example": 1000 }, fetch: f, sleep: async (ms) => void waits.push(ms) });
    expect((await http("https://a.example/x")).status).toBe(200);
    expect(waits).toContain(2000); // Retry-After
    expect((f.mock.calls[0]![1]!.headers as Record<string, string>)["User-Agent"]).toMatch(/^SonicStage/);

    const always = vi.fn<typeof fetch>(async () => new Response("", { status: 503 }));
    const http2 = createPoliteFetch({ minIntervalMs: {}, fetch: always, sleep: async () => undefined });
    await expect(http2("https://b.example/")).rejects.toBeInstanceOf(SourceBusyError);
    expect(always).toHaveBeenCalledTimes(2);
  });
});
