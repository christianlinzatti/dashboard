import { describe, expect, it, vi } from "vitest";
import { flickrPhotos, FLICKR_LICENSES } from "@/lib/info/flickr";
import { geniusTrivia } from "@/lib/info/genius";
import { displayUrl, rankPhotos } from "@/lib/info/photos";
import { createInfoService, lookupArtist } from "@/lib/info/service";
import { audioDbArtist, AUDIODB_TEST_KEY } from "@/lib/info/theaudiodb";
import { factAt, infoEntries, wallPhotoAt, wallPhotos } from "@/lib/info/display";
import { CACHE_TTL } from "@/lib/cache-policy";
import { memoryCache } from "@/lib/lyrics/cache";
import { derive } from "@/lib/song-context/derive";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { infoSchema, type Photo, type SongStatic } from "@/lib/song-context/schema";
import adbColdplay from "../fixtures/theaudiodb/coldplay-mb.json";
import adbNotFound from "../fixtures/theaudiodb/not-found.json";

const COLDPLAY_MBID = "cc197bad-dc9c-440d-a5b5-d52ba2e14234";
type Http = (url: string, init?: RequestInit) => Promise<Response>;
type Get = (url: string) => Promise<Response>;
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe("TheAudioDB (echte Antwort)", () => {
  it("per MusicBrainz-ID: Fanart 16:9, Logo, Fakten auf Deutsch, Biografie gekürzt", async () => {
    const http = vi.fn<Get>(async () => ok(adbColdplay));
    const a = (await audioDbArtist({ mbid: COLDPLAY_MBID, name: "Coldplay" }, http))!;
    expect(http.mock.calls[0]![0]).toBe(
      `https://www.theaudiodb.com/api/v1/json/${AUDIODB_TEST_KEY}/artist-mb.php?i=${COLDPLAY_MBID}`,
    );
    expect(a.facts).toEqual(["Alternative Rock", "4 Mitglieder", "Herkunft: Vereinigtes Königreich"]);
    expect(a.logo).toMatch(/^https:\/\/r2\.theaudiodb\.com\/images\/media\/artist\/logo\//);
    expect(a.photos.map((p) => p.kind)).toEqual(["fanart", "fanart", "fanart", "fanart", "fanart", "thumb"]);
    expect(a.photos[0]).toMatchObject({ width: 1280, height: 720, source: "theaudiodb", credit: "TheAudioDB" });
    expect(a.bioDe!.startsWith("Coldplay ist eine britische Pop-Rock-Band")).toBe(true);
    expect(a.bioDe!.length).toBeLessThanOrEqual(322);
  });
  it("falsche MBID, unbekannter Name, 404 → null; Namenssuche prüft exakt", async () => {
    expect(await audioDbArtist({ mbid: "andere-id", name: "Coldplay" }, async () => ok(adbColdplay))).toBeNull();
    expect(await audioDbArtist({ name: "Gibtsnicht" }, async () => ok(adbNotFound))).toBeNull();
    expect(await audioDbArtist({ name: "Coldplay" }, async () => ok({ Message: "Not found" }, 404))).toBeNull();
    expect(await audioDbArtist({ name: "coldplay" }, async () => ok(adbColdplay))).not.toBeNull();
    expect(await audioDbArtist({ name: "Coldplay Tribute" }, async () => ok(adbColdplay))).toBeNull();
    await expect(audioDbArtist({ name: "X" }, async () => ok({}, 500))).rejects.toThrow("500");
  });
});

describe("Flickr (Format laut API-Doku)", () => {
  const photo = (p: Record<string, unknown>) => ({
    id: "1",
    owner: "12@N00",
    secret: "s",
    server: "65535",
    farm: 66,
    title: "Coldplay live in Wien",
    ispublic: 1,
    license: "4",
    ownername: "Fotografin A",
    tags: "coldplay concert vienna",
    url_l: "https://live.staticflickr.com/65535/1_s_b.jpg",
    height_l: 683,
    width_l: 1024,
    ...p,
  });
  it("alle Lizenzen (mit Angabe), groß genug, Name in Titel oder Tags", async () => {
    const http = vi.fn<Get>(async () =>
      ok({
        photos: {
          page: 1,
          pages: 1,
          perpage: 30,
          total: 5,
          photo: [
            photo({}),
            photo({ id: "2", license: "3" }), // CC BY-NC-ND
            photo({ id: "3", license: "0" }), // alle Rechte vorbehalten
            photo({ id: "7", license: "99" }), // unbekannte Lizenz-Nummer
            photo({ id: "4", width_l: "500" }), // zu klein
            photo({ id: "5", title: "Konzertabend", tags: "coldplay" }), // Tag passt
            photo({ id: "6", title: "Sonnenuntergang", tags: "sunset" }), // passt nicht
          ],
        },
        stat: "ok",
      }),
    );
    const out = await flickrPhotos("Coldplay", "KEY", http);
    const url = new URL(http.mock.calls[0]![0]);
    expect(url.searchParams.has("license")).toBe(false); // kein Lizenzfilter
    expect(out.map((p) => p.sourceUrl.split("/").at(-1))).toEqual(["1", "2", "3", "7"]); // höchstens 4 Fotos
    expect(out.map((p) => p.license)).toEqual(["CC BY 2.0", "CC BY-NC-ND 2.0", FLICKR_LICENSES["0"], "Lizenz unbekannt"]);
    expect(out[0]).toMatchObject({ width: 1024, height: 683, credit: "Fotografin A", source: "flickr" });
    // zu klein (4) und ohne Namensbezug (6) fallen weg
    const all = await flickrPhotos("Coldplay", "KEY", http, undefined, 10);
    expect(all.map((p) => p.sourceUrl.split("/").at(-1))).toEqual(["1", "2", "3", "7", "5"]);
  });
  it("Fehlermeldung von Flickr → Ausnahme", async () => {
    await expect(
      flickrPhotos("X", "bad", async () => ok({ stat: "fail", code: 100, message: "Invalid API Key" })),
    ).rejects.toThrow("Invalid API Key");
  });
});

describe("Genius (Format laut API-Doku)", () => {
  const search = {
    meta: { status: 200 },
    response: {
      hits: [
        { type: "song", result: { id: 9, title: "Neonlicht (Remix)", url: "u9", primary_artist: { name: "Andere" } } },
        {
          type: "song",
          result: {
            id: 1,
            title: "Neonlicht (feat. Kai Vento)",
            url: "https://genius.com/x",
            primary_artist: { name: "Mira Sol" },
          },
        },
      ],
    },
  };
  const song = {
    meta: { status: 200 },
    response: {
      song: {
        id: 1,
        url: "https://genius.com/x",
        producer_artists: [{ name: "Max Martin" }, { name: "Shellback" }, { name: "Dritter" }],
        writer_artists: [{ name: "Mira Sol" }, { name: "Kai Vento" }, { name: "Max Martin" }],
        song_relationships: [
          { relationship_type: "samples", songs: [{ title: "Blue Monday", primary_artist: { name: "New Order" } }] },
          {
            relationship_type: "sampled_in",
            songs: [
              { title: "a", primary_artist: { name: "b" } },
              { title: "c", primary_artist: { name: "d" } },
            ],
          },
          { relationship_type: "cover_of", songs: [] },
        ],
      },
    },
  };
  it("Produzenten, fremde Songwriter, Samples; Token im Header", async () => {
    const http = vi.fn<Http>(async (url) => ok(url.includes("/search") ? search : song));
    const t = (await geniusTrivia(
      { title: "Neonlicht", artist: "Mira Sol", artists: ["Mira Sol", "Kai Vento"] },
      "TOKEN",
      http,
    ))!;
    expect(new Headers(http.mock.calls[0]![1]?.headers).get("authorization")).toBe("Bearer TOKEN");
    expect(http.mock.calls[1]![0]).toBe("https://api.genius.com/songs/1?text_format=plain");
    expect(t.trivia).toEqual([
      "Produziert von Max Martin, Shellback u. a.",
      "Mitgeschrieben von Max Martin",
      "Sampelt „Blue Monday“ von New Order",
      "Wurde in 2 Songs gesampelt",
    ]);
  });
  it("kein passender Treffer → null; Fehler → Ausnahme", async () => {
    expect(await geniusTrivia({ title: "Anders", artist: "Mira Sol" }, "T", async () => ok(search))).toBeNull();
    await expect(geniusTrivia({ title: "x", artist: "y" }, "T", async () => ok({}, 401))).rejects.toThrow("401");
  });
});

describe("Fotoauswahl", () => {
  const p = (x: Partial<Photo>): Photo => ({ url: x.url ?? "u", credit: "c", license: "l", sourceUrl: "s", ...x });
  const commonsPortrait = p({ url: "commons", width: 800, height: 1200, source: "commons", kind: "photo" });
  const fanart = p({ url: "fanart", width: 1280, height: 720, source: "theaudiodb", kind: "fanart" });
  const thumb = p({ url: "thumb", width: 700, height: 700, source: "theaudiodb", kind: "thumb" });
  const flickr = p({ url: "flickr", width: 1024, height: 683, source: "flickr", kind: "photo" });
  it("Wand: Bühnenbild im Querformat vor Konzertfoto vor Porträt", () => {
    expect(rankPhotos([commonsPortrait, thumb, flickr, fanart], "wall").map((x) => x.url)).toEqual([
      "fanart",
      "flickr",
      "thumb",
      "commons",
    ]);
  });
  it("Karte: quadratisch/Porträt zuerst", () => {
    expect(rankPhotos([fanart, flickr, commonsPortrait, thumb], "card")[0]!.url).toBe("thumb");
    expect(rankPhotos([fanart, commonsPortrait], "card")[0]!.url).toBe("commons");
  });
  it("Fremd-Hosts über den Bildoptimierer, sonst unverändert", () => {
    expect(displayUrl("https://r2.theaudiodb.com/images/a.jpg")).toBe(
      "/_next/image?url=https%3A%2F%2Fr2.theaudiodb.com%2Fimages%2Fa.jpg&w=1280&q=75",
    );
    expect(displayUrl("https://live.staticflickr.com/1.jpg", 640)).toContain("w=640");
    expect(displayUrl("https://upload.wikimedia.org/x.jpg")).toBe("https://upload.wikimedia.org/x.jpg");
    expect(displayUrl("/demo/mira-sol.svg")).toBe("/demo/mira-sol.svg");
    expect(displayUrl("http://r2.theaudiodb.com/x.jpg")).toBe("http://r2.theaudiodb.com/x.jpg");
  });
});

describe("Anzeige mit mehreren Fotos und Trivia", () => {
  const extra: SongStatic = {
    ...neonlicht,
    info: {
      ...neonlicht.info!,
      artists: {
        ...neonlicht.info!.artists,
        "demo-mira": { ...neonlicht.info!.artists["demo-mira"]!, logo: "https://r2.theaudiodb.com/images/logo.png" },
      },
      photos: [
        ...neonlicht.info!.photos,
        {
          url: "https://r2.theaudiodb.com/images/fanart.jpg",
          width: 1280,
          height: 720,
          kind: "fanart",
          source: "theaudiodb",
          credit: "TheAudioDB",
          license: "TheAudioDB-Community",
          sourceUrl: "s",
          artistId: "demo-mira",
        },
      ],
      song: { trivia: ["Produziert von Max Martin"], url: "https://genius.com/x" },
    },
  };
  it("Wand wechselt je Abschnitt zwischen den Fotos des Leads", () => {
    expect(wallPhotos(extra).map((x) => x.artistId)).toEqual(["demo-mira", "demo-mira"]);
    const urls = extra.lyrics!.sections.map((s) => wallPhotoAt(extra, s.startMs)!.url);
    expect(new Set(urls).size).toBe(2);
    expect(wallPhotoAt(extra, 0)!.url).toContain("fanart"); // bestes Querformat zuerst
    expect(wallPhotoAt({ ...extra, lyrics: undefined }, 61_000)!.url).toBe(
      wallPhotoAt({ ...extra, lyrics: undefined }, 0)!.url === urls[0] ? urls[1] : urls[0],
    );
  });
  it("Logo und Trivia im Fakten-Ticker", () => {
    expect(infoEntries(extra)[0]!.logo).toContain("logo.png");
    const shown = new Set<string>();
    for (let t = 1000; t < extra.track.durationMs; t += 24_000) {
      const f = factAt(extra, derive(extra, t), t);
      if (f) shown.add(f);
    }
    expect(shown).toContain("Neonlicht · Produziert von Max Martin");
    expect(() => infoSchema.parse(extra.info)).not.toThrow();
  });
});

describe("Info-Service mit allen Quellen", () => {
  const MBID = COLDPLAY_MBID;
  const mb = { artists: [{ id: MBID, name: "Coldplay", score: 100, type: "Group", "life-span": { begin: "1996" } }] };
  const fake = (over: Record<string, () => Response> = {}) => {
    const calls: string[] = [];
    const http = vi.fn(async (url: string) => {
      calls.push(url);
      for (const [k, v] of Object.entries(over)) if (url.includes(k)) return v();
      if (url.includes("musicbrainz.org/ws/2/artist?")) return ok(mb);
      if (url.includes(`musicbrainz.org/ws/2/artist/${MBID}`))
        return ok({ id: MBID, name: "Coldplay", type: "Group", "life-span": { begin: "1996" }, relations: [] });
      if (url.includes("theaudiodb.com")) return ok(adbColdplay);
      return new Response("nicht gefunden", { status: 404 });
    });
    return { http, calls };
  };

  it("ohne Wikipedia: deutscher Text von TheAudioDB, Fotos und Logo", async () => {
    const info = (await lookupArtist("Coldplay", fake().http))!;
    expect(info.textSource).toBe("theaudiodb");
    expect(info.summary.startsWith("Coldplay ist eine britische")).toBe(true);
    expect(info.logo).toBeDefined();
    expect(info.photos).toHaveLength(6);
    expect(info.facts[0]).toBe("Gegründet 1996");
  });

  it("TheAudioDB ausgefallen → Teilergebnis, nur kurz gecacht; abschaltbar", async () => {
    const f = fake({ "theaudiodb.com": () => ok({}, 503) });
    const cache = memoryCache();
    const set = vi.spyOn(cache, "set");
    const svc = createInfoService({ cache, http: f.http });
    await svc([{ id: "sp", name: "Coldplay" }]);
    expect(set).toHaveBeenCalledWith("info:v2:coldplay", expect.anything(), CACHE_TTL.infoMissing);
    const off = fake();
    await lookupArtist("Coldplay", off.http, undefined, { audioDb: null });
    expect(off.calls.some((c) => c.includes("theaudiodb"))).toBe(false);
  });

  it("Genius-Trivia je Song, gecacht", async () => {
    const g = vi.fn<Http>(async (url) =>
      ok(
        url.includes("/search")
          ? {
              response: {
                hits: [{ type: "song", result: { id: 1, title: "Yellow", url: "u", primary_artist: { name: "Coldplay" } } }],
              },
            }
          : { response: { song: { url: "https://genius.com/yellow", producer_artists: [{ name: "Ken Nelson" }] } } },
      ),
    );
    const svc = createInfoService({ cache: memoryCache(), http: fake().http, genius: { token: "T", fetch: g as typeof fetch } });
    const r = await svc([{ id: "sp", name: "Coldplay" }], undefined, { title: "Yellow" });
    expect(r.info.song).toEqual({ trivia: ["Produziert von Ken Nelson"], url: "https://genius.com/yellow" });
    await svc([{ id: "sp", name: "Coldplay" }], undefined, { title: "Yellow" });
    expect(g).toHaveBeenCalledTimes(2); // Suche + Song, danach aus dem Cache
    const broken = createInfoService({
      cache: memoryCache(),
      http: fake().http,
      genius: { token: "T", fetch: (async () => ok({}, 500)) as typeof fetch },
    });
    expect((await broken([{ id: "sp", name: "Coldplay" }], undefined, { title: "Yellow" })).complete).toBe(false);
  });
});

describe("Bild-Proxy", () => {
  it("jede angefragte Breite und jeder Proxy-Host ist in next.config.ts erlaubt", async () => {
    const { default: config } = await import("@/next.config");
    const { PROXIED_IMAGE_HOSTS, PROXY_WIDTHS } = await import("@/lib/info/photos");
    const widths = [...(config.images?.deviceSizes ?? []), ...(config.images?.imageSizes ?? [])];
    for (const w of PROXY_WIDTHS) expect(widths, `Breite ${w}`).toContain(w);
    const hosts = (config.images?.remotePatterns ?? []).map((p) => ("hostname" in p ? p.hostname : ""));
    for (const h of PROXIED_IMAGE_HOSTS) expect(hosts, h).toContain(h);
  });

  it("Last.fm-Cover laufen über den Proxy; der graue Platzhalter-Stern wird weggelassen", async () => {
    const { coverOf } = await import("@/lib/personal/lastfm");
    const url = "https://lastfm.freetls.fastly.net/i/u/300x300/abc123.jpg";
    expect(displayUrl(url, 128)).toBe(`/_next/image?url=${encodeURIComponent(url)}&w=128&q=75`);
    expect(coverOf([{ "#text": "klein.jpg" }, { "#text": url }, { "#text": "" }])).toBe(url);
    expect(
      coverOf([{ "#text": "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png" }]),
    ).toBeUndefined();
    expect(coverOf([])).toBeUndefined();
  });
});
