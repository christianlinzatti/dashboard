import { describe, expect, it, vi } from "vitest";
import { distanceKm, home } from "@/lib/concerts/geo";
import { mergeEvents } from "@/lib/concerts/merge";
import { bandsintown, isOeticketMatch, lastSetlist, oeticket, ticketmaster } from "@/lib/concerts/providers";
import oeRoy from "../fixtures/oeticket/roy-bianco.json";
import oeColdplay from "../fixtures/oeticket/coldplay.json";
import oeFallback from "../fixtures/oeticket/fallback-paul-van-dyk.json";
import { concertProviders, createConcertService } from "@/lib/concerts/service";
import {
  concertCardAt,
  countdown,
  daysUntil,
  formatConcertDate,
  liveHint,
  todayLocal,
  topConcerts,
} from "@/lib/concerts/display";
import { cardShownAt, infoCardAt } from "@/lib/info/display";
import { memoryCache } from "@/lib/lyrics/cache";
import { CACHE_TTL } from "@/lib/cache-policy";
import { fixtures } from "@/lib/song-context/fixtures";
import type { Derived } from "@/lib/song-context/schema";
import type { RawEvent } from "@/lib/concerts/types";

const WIEN = { name: "Wien", lat: 48.2082, lon: 16.3738, radiusKm: 200 };
type Http = (url: string, init?: RequestInit) => Promise<Response>;
type Get = (url: string) => Promise<Response>;
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ev = (p: Partial<RawEvent>): RawEvent => ({
  provider: "x",
  artistName: "A",
  date: "2026-12-01",
  venue: "V",
  city: "Wien",
  ...p,
});

describe("Geo", () => {
  it("Luftlinie Wien–Linz ≈ 155 km", () => {
    expect(Math.round(distanceKm(WIEN, { lat: 48.3069, lon: 14.2858 }))).toBeGreaterThan(150);
    expect(Math.round(distanceKm(WIEN, { lat: 48.3069, lon: 14.2858 }))).toBeLessThan(160);
  });
  it("Heimatort aus Env, sonst Wien", () => {
    vi.stubEnv("HOME_LAT", "");
    vi.stubEnv("CONCERT_RADIUS_KM", "");
    expect(home()).toMatchObject({ name: "Wien", lat: 48.2082, radiusKm: 200 });
    vi.stubEnv("HOME_LOCATION", "Linz");
    vi.stubEnv("HOME_LAT", "48.3");
    vi.stubEnv("HOME_LON", "14.3");
    vi.stubEnv("CONCERT_RADIUS_KM", "100");
    expect(home()).toEqual({ name: "Linz", lat: 48.3, lon: 14.3, radiusKm: 100 });
    vi.unstubAllEnvs();
  });
});

describe("Termine zusammenführen", () => {
  const artist = { id: "a1", name: "A" };
  it("gleicher Tag + Stadt (Wien = Vienna) wird ein Konzert, Ticket von bevorzugter Quelle", () => {
    const out = mergeEvents(
      artist,
      [
        { provider: { id: "bandsintown", ticketPriority: 3 }, events: [ev({ city: "Vienna", ticketUrl: "bit", soldOut: true })] },
        {
          provider: { id: "ticketmaster", ticketPriority: 2 },
          events: [ev({ ticketUrl: "tm", time: "20:00", lat: 48.2, lon: 16.4 })],
        },
      ],
      { today: "2026-11-14", home: WIEN },
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      ticketUrl: "tm",
      soldOut: true,
      time: "20:00",
      providers: ["bandsintown", "ticketmaster"],
      distanceKm: 0,
    });
  });
  it("vergangene und abgesagte Termine fallen weg, Umkreis zuerst", () => {
    const out = mergeEvents(
      artist,
      [
        {
          provider: { id: "tm", ticketPriority: 1 },
          events: [
            ev({ date: "2026-11-01" }),
            ev({ date: "2026-11-20", city: "Berlin", lat: 52.52, lon: 13.4 }),
            ev({ date: "2027-01-10", city: "Graz", lat: 47.07, lon: 15.44 }),
            ev({ date: "2026-12-24", city: "Linz", cancelled: true }),
          ],
        },
      ],
      { today: "2026-11-14", home: WIEN },
    );
    expect(out.map((c) => c.city)).toEqual(["Graz", "Berlin"]);
  });
  it("Heimatstadt ohne Koordinaten zählt als nah", () => {
    const [c] = mergeEvents(artist, [{ provider: { id: "x", ticketPriority: 1 }, events: [ev({ city: "Wien" })] }], {
      today: "2026-11-14",
      home: WIEN,
    });
    expect(c!.distanceKm).toBe(0);
  });
});

describe("Ticketmaster (Discovery v2)", () => {
  const body = {
    _embedded: {
      events: [
        {
          name: "A – Tour",
          url: "https://www.ticketmaster.at/event/1",
          dates: { start: { localDate: "2026-12-05", localTime: "20:00:00" }, status: { code: "onsale" } },
          _embedded: {
            venues: [
              {
                name: "Stadthalle",
                city: { name: "Wien" },
                country: { countryCode: "AT" },
                location: { latitude: "48.20", longitude: "16.33" },
              },
            ],
            attractions: [{ name: "A" }],
          },
        },
        {
          name: "A Tribute",
          dates: { start: { localDate: "2026-12-06" } },
          _embedded: { venues: [{ name: "Bar", city: { name: "Graz" } }], attractions: [{ name: "Tribute Band" }] },
        },
        {
          name: "A abgesagt",
          dates: { start: { localDate: "2026-12-07" }, status: { code: "cancelled" } },
          _embedded: { venues: [{ city: { name: "Linz" } }], attractions: [{ name: "a" }] },
        },
      ],
    },
  };
  it("nur echte Auftritte, Koordinaten als Zahl, Absage erkannt", async () => {
    const http = vi.fn<Http>(async () => ok(body));
    const out = await ticketmaster("KEY", http).events("A");
    const url = new URL(http.mock.calls[0]![0]);
    expect(url.searchParams.get("apikey")).toBe("KEY");
    expect(url.searchParams.get("classificationName")).toBe("music");
    expect(url.searchParams.get("size")).toBe("200");
    expect(url.searchParams.get("locale")).toBe("*");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ date: "2026-12-05", time: "20:00", city: "Wien", lat: 48.2, country: "AT", cancelled: false });
    expect(out[1]!.cancelled).toBe(true);
  });
  it("keine Treffer → leer; Fehler → Ausnahme", async () => {
    expect(await ticketmaster("K", async () => ok({ page: { totalElements: 0 } })).events("A")).toEqual([]);
    await expect(ticketmaster("K", async () => ok({ fault: {} }, 401)).events("A")).rejects.toThrow("401");
  });
});

describe("Bandsintown", () => {
  it("Termine mit Ticket-Angebot und Ausverkauft-Status", async () => {
    const http = vi.fn<Http>(async () =>
      ok([
        {
          url: "https://www.bandsintown.com/e/1",
          datetime: "2027-02-13T19:30:00",
          venue: { name: "Posthof", city: "Linz", country: "Austria", latitude: "48.30", longitude: "14.31" },
          offers: [{ type: "Tickets", url: "https://tix/1", status: "sold out" }],
          lineup: ["A B"],
        },
        { datetime: "2027-03-01T20:00:00", venue: { city: "Prag" }, offers: [], lineup: ["Andere Band"] },
      ]),
    );
    const out = await bandsintown("app", http).events("A B");
    expect(http.mock.calls[0]![0]).toContain("/artists/A%20B/events?app_id=app&date=upcoming");
    expect(out).toEqual([
      expect.objectContaining({
        date: "2027-02-13",
        time: "19:30",
        city: "Linz",
        lat: 48.3,
        ticketUrl: "https://tix/1",
        soldOut: true,
      }),
    ]);
  });
  it("unbekannter Künstler → leer", async () => {
    expect(await bandsintown("app", async () => ok({ errorMessage: "[NotFound]" })).events("X")).toEqual([]);
    expect(await bandsintown("app", async () => ok({}, 404)).events("X")).toEqual([]);
    await expect(bandsintown("app", async () => ok({}, 403)).events("X")).rejects.toThrow("403");
  });
});

describe("oeticket (echte Antworten der Eventim-Such-API)", () => {
  it("eigene Konzerte und Festival-Lineup, Ortszeit, Koordinaten, Ticket-Link", async () => {
    const http = vi.fn<Http>(async () => ok(oeRoy));
    const out = await oeticket(http).events("Roy Bianco & Die Abbrunzati Boys");
    const url = new URL(http.mock.calls[0]![0]);
    expect(url.searchParams.get("webId")).toBe("web__oeticket-at");
    expect(url.searchParams.get("search_term")).toBe("Roy Bianco & Die Abbrunzati Boys");
    expect(out.map((e) => e.city)).toEqual(["Saalbach", "Wien", "Salzburg", "Düsseldorf"]);
    expect(out[1]).toMatchObject({
      date: "2027-09-30",
      time: "19:00",
      venue: "Wiener Stadthalle - Halle D",
      lat: 48.2024112,
      ticketUrl: expect.stringContaining("oeticket.com/event/"),
      cancelled: false,
    });
    expect(http).toHaveBeenCalledTimes(1); // nur eine Seite vorhanden
  });
  it("Tribute-Show mit Künstlernamen im Titel zählt nicht", async () => {
    expect(await oeticket(async () => ok(oeColdplay)).events("Coldplay")).toEqual([]);
  });
  it("unscharfe Ersatzsuche liefert keine Termine und keine weiteren Seiten", async () => {
    const http = vi.fn<Http>(async () => ok(oeFallback));
    expect(await oeticket(http).events("Paul van Dyk")).toEqual([]);
    expect(oeFallback.totalPages).toBeGreaterThan(1);
    expect(http).toHaveBeenCalledTimes(1);
  });
  it("Titel-Regel ohne Attraktion; Absage erkannt; Fehler", async () => {
    expect(isOeticketMatch({ name: "KMFDM - Europe 2026", attractions: [] }, "KMFDM")).toBe(true);
    expect(isOeticketMatch({ name: "Severina @ Pula", attractions: [] }, "Severina")).toBe(true);
    expect(isOeticketMatch({ name: "KMFDMX", attractions: [] }, "KMFDM")).toBe(false);
    const cancelled = {
      totalPages: 1,
      products: [
        {
          name: "KMFDM - Europe 2026",
          status: "Cancelled",
          typeAttributes: { liveEntertainment: { startDate: "2026-12-08T20:00:00+01:00", location: { city: "Leipzig" } } },
        },
      ],
    };
    expect((await oeticket(async () => ok(cancelled)).events("KMFDM"))[0]!.cancelled).toBe(true);
    await expect(oeticket(async () => new Response("Access Denied", { status: 403 })).events("X")).rejects.toThrow("403");
  });
  it("blättert über alle Seiten (ohne `top`, sonst kommt immer Seite 1), höchstens 8", async () => {
    const http = vi.fn<Http>(async () => ok({ totalPages: 5, products: [] }));
    await oeticket(http).events("X");
    const urls = http.mock.calls.map((c) => new URL(c[0]));
    expect(urls.map((u) => u.searchParams.get("page"))).toEqual(["1", "2", "3", "4", "5"]);
    expect(urls.every((u) => !u.searchParams.has("top"))).toBe(true);
    const many = vi.fn<Http>(async () => ok({ totalPages: 30, products: [] }));
    await oeticket(many).events("X");
    expect(many).toHaveBeenCalledTimes(8);
  });
});

describe("Eventim Deutschland (echte Antwort)", () => {
  it("echte Termine auf späteren Seiten werden gefunden (Wanda: Tour erst ab Seite 5); Ticketarten zählen einmal", async () => {
    const { eventimSearch } = await import("@/lib/concerts/providers");
    const pages = (await import("../fixtures/oeticket/eventim-de-wanda-seiten.json")).default;
    const http = vi.fn<Http>(async (url) => ok(pages[Number(new URL(url).searchParams.get("page")) - 1] ?? { products: [] }));
    const out = await eventimSearch("eventim", http).events("Wanda");
    expect(http).toHaveBeenCalledTimes(6);
    const cities = out.map((e) => e.city);
    expect(cities).toEqual(expect.arrayContaining(["Wien", "Osnabrück", "Hamburg", "Berlin", "München", "Friedrichshafen"]));
    expect(out.every((e) => e.artistName === "Wanda")).toBe(true); // „Wandern“, „Wandelhalle“ … verworfen
    // je Produkt einmal, aber zwei Produkte für denselben Abend bleiben zwei Rohtermine – das Zusammenführen macht eins daraus
    const merged = mergeEvents({ id: "w", name: "Wanda" }, [{ provider: { id: "eventim", ticketPriority: 1.5 }, events: out }], {
      today: "2026-11-24",
      home: WIEN,
      limit: 100,
    });
    expect(new Set(merged.map((c) => `${c.date}|${c.city}`)).size).toBe(merged.length);
    expect(merged.every((c) => c.providers.length === 1)).toBe(true);
  });
  it("eigener Shop, Fremdtreffer verworfen, Ticket-Link von eventim.de", async () => {
    const { eventimSearch } = await import("@/lib/concerts/providers");
    const de = (await import("../fixtures/oeticket/eventim-de-roy-bianco.json")).default;
    const http = vi.fn<Http>(async () => ok(de));
    const out = await eventimSearch("eventim", http).events("Roy Bianco & Die Abbrunzati Boys");
    const url = new URL(http.mock.calls[0]![0]);
    expect(url.searchParams.get("webId")).toBe("web__eventim-de");
    expect(url.searchParams.has("retail_partner")).toBe(false);
    expect(out.map((e) => e.city)).toEqual(["Wien", "Salzburg", "Dübendorf", "München", "Leipzig"]); // nicht „Udo West / Roy Birra …“
    expect(out[0]).toMatchObject({ provider: "eventim", ticketUrl: expect.stringContaining("https://www.eventim.de/event/") });
  });

  it("gleicher Termin bei oeticket und Eventim: ein Konzert, oeticket-Link bevorzugt", async () => {
    const { EVENTIM_SHOPS } = await import("@/lib/concerts/providers");
    const [c] = mergeEvents(
      { id: "a", name: "A" },
      [
        {
          provider: { id: "eventim", ticketPriority: EVENTIM_SHOPS.eventim.ticketPriority },
          events: [ev({ provider: "eventim", ticketUrl: "https://www.eventim.de/x" })],
        },
        {
          provider: { id: "oeticket", ticketPriority: EVENTIM_SHOPS.oeticket.ticketPriority },
          events: [ev({ provider: "oeticket", ticketUrl: "https://www.oeticket.com/x" })],
        },
        {
          provider: { id: "ticketmaster", ticketPriority: 2 },
          events: [ev({ provider: "ticketmaster", ticketUrl: "https://tm/x" })],
        },
      ],
      { today: "2026-11-14", home: WIEN },
    );
    expect(c).toMatchObject({ ticketUrl: "https://www.oeticket.com/x", providers: ["eventim", "oeticket", "ticketmaster"] });
  });
});

describe("setlist.fm", () => {
  it("letzte Setlist mit Songs, Datum umgestellt, x-api-key gesetzt", async () => {
    const http = vi.fn<Http>(async () =>
      ok({
        setlist: [
          { eventDate: "20-10-2026", artist: { name: "A" }, sets: { set: [] } },
          {
            eventDate: "18-10-2026",
            artist: { name: "A" },
            venue: { name: "Halle", city: { name: "Graz" } },
            tour: { name: "Tour" },
            sets: { set: [{ song: [{ name: "Eins" }, { name: "" }] }, { song: [{ name: "Zwei" }] }] },
          },
        ],
      }),
    );
    expect(await lastSetlist("K", "A", http)).toEqual({
      date: "2026-10-18",
      city: "Graz",
      tour: "Tour",
      songs: ["Eins", "Zwei"],
    });
    expect(new Headers(http.mock.calls[0]![1]?.headers).get("x-api-key")).toBe("K");
    expect(await lastSetlist("K", "A", async () => ok({}, 404))).toBeNull();
    await expect(lastSetlist("K", "A", async () => ok({}, 403))).rejects.toThrow("403");
  });
});

describe("Konzert-Dienst", () => {
  it("Provider nur mit Zugangsdaten", () => {
    expect(concertProviders({}).map((p) => p.id)).toEqual(["oeticket", "eventim"]);
    expect(concertProviders({ OETICKET: "0", EVENTIM_DE: "0" }).map((p) => p.id)).toEqual([]);
    expect(concertProviders({ TICKETMASTER_API_KEY: "k", BANDSINTOWN_APP_ID: "a" }).map((p) => p.id)).toEqual([
      "oeticket",
      "eventim",
      "ticketmaster",
      "bandsintown",
    ]);
  });
  it("Teilergebnisse nur kurz, vollständige lange gecacht; Setlist mit Cache", async () => {
    const good = { id: "g", ticketPriority: 1, events: vi.fn(async () => [ev({ provider: "g" })]) };
    const bad = { id: "b", ticketPriority: 2, events: vi.fn(async (): Promise<RawEvent[]> => Promise.reject(new Error("x"))) };
    const cache = memoryCache();
    const setSpy = vi.spyOn(cache, "set");
    const setlistFetch = vi.fn(async () =>
      ok({ setlist: [{ eventDate: "01-10-2026", artist: { name: "A" }, sets: { set: [{ song: [{ name: "S" }] }] } }] }),
    );
    const svc = createConcertService({ providers: [good, bad], cache, setlistKey: "K", today: () => "2026-11-14", setlistFetch });
    const r1 = await svc([{ id: "a1", name: "A" }]);
    expect(r1.concerts).toHaveLength(1);
    expect(r1.setlists.a1?.songs).toEqual(["S"]);
    expect(setSpy).toHaveBeenCalledWith("concerts:v2:a", expect.anything(), CACHE_TTL.concertsPartial);
    // Fehler bleibt auch aus dem Cache sichtbar
    expect(r1.sources).toEqual([
      expect.objectContaining({ artist: "A", provider: "g", state: "ok", events: 1, cached: false }),
      expect.objectContaining({ artist: "A", provider: "b", state: "fehler", error: "x", cached: false }),
    ]);
    const r2 = await svc([{ id: "a1", name: "A" }]);
    expect(r2.sources.map((x) => [x.provider, x.state, x.cached])).toEqual([
      ["g", "ok", true],
      ["b", "fehler", true],
    ]);
    expect(good.events).toHaveBeenCalledTimes(1); // Teilergebnis aus dem Cache
    // ohne Cache neu fragen (/debug)
    await svc([{ id: "a1", name: "A" }], undefined, undefined, { fresh: true });
    expect(good.events).toHaveBeenCalledTimes(2);
    good.events.mockClear();
    expect(setlistFetch).toHaveBeenCalledTimes(1);

    const cache2 = memoryCache();
    const setSpy2 = vi.spyOn(cache2, "set");
    const svc2 = createConcertService({ providers: [good], cache: cache2, today: () => "2026-11-14" });
    await svc2([{ id: "a1", name: "A" }]);
    await svc2([{ id: "a1", name: "A" }]);
    expect(good.events).toHaveBeenCalledTimes(1);
    expect(setSpy2).toHaveBeenCalledWith("concerts:v2:a", expect.anything(), CACHE_TTL.concerts);
  });
  it("Setlist-Fehler wird ignoriert", async () => {
    const svc = createConcertService({
      providers: [],
      cache: memoryCache(),
      setlistKey: "K",
      setlistFetch: async () => ok({}, 500),
    });
    expect((await svc([{ id: "a", name: "A" }])).setlists).toEqual({});
  });
});

describe("Konzertanzeige", () => {
  const song = fixtures.neonlicht!;
  const d = (p: Partial<Derived> = {}) => ({ section: "outro", lineActive: false, ...p }) as Derived;
  it("Datum, Countdown", () => {
    expect(formatConcertDate("2026-12-05")).toBe("Sa, 5. Dez.");
    expect(formatConcertDate("2027-01-10")).toBe("So, 10. Jän.");
    // mehr als ~10 Monate entfernt mit Jahr – sonst sieht „Mi, 24. Nov.“ in einem Jahr aus wie heute
    expect(formatConcertDate("2027-11-24", "2026-11-24")).toBe("Mi, 24. Nov. 2027");
    expect(formatConcertDate("2027-06-23", "2026-11-24")).toBe("Mi, 23. Juni");
    expect(daysUntil("2026-12-05", "2026-11-14")).toBe(21);
    expect(countdown("2026-11-14", "2026-11-14")).toBe("heute");
    expect(countdown("2026-11-15", "2026-11-14")).toBe("morgen");
    expect(countdown("2026-12-05", "2026-11-14")).toBe("in 21 Tagen");
    expect(countdown("2027-05-14", "2026-11-14")).toBe("in 6 Monaten");
    expect(todayLocal(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
  it("Karte gegen Songende (18 bis 5 s vor Schluss), Umkreis zuerst, Info-Karte weicht", () => {
    // in den letzten 5 s verbeugt sich die Band – dann keine Karte
    expect(concertCardAt(song, d(), song.track.durationMs - 3000)).toBeNull();
    expect(concertCardAt(song, d(), 180_000)).toBeNull();
    expect(infoCardAt(song, d(), 180_000)).not.toBeNull();
    const card = concertCardAt(song, d(), 190_000)!;
    expect(card.near).toBe(true);
    expect(card.concerts.map((c) => c.city)).toEqual(["Wien", "Linz", "Berlin"]);
    expect(infoCardAt(song, d(), 190_000)).toBeNull();
    expect(cardShownAt(song, d(), 190_000)).toBe(true);
    expect(concertCardAt(song, d({ lineActive: true }), 190_000)).toBeNull();
    expect(concertCardAt({ ...song, concerts: [] }, d(), 190_000)).toBeNull();
  });
  it("nur ferne Termine → „Nächste Konzerte“", () => {
    expect(topConcerts({ ...song, concerts: [{ ...song.concerts![2]! }] }).near).toBe(false);
  });
  it("Setlist-Hinweis", () => {
    expect(liveHint(song)).toBe("Zuletzt live: 18.10.2026 in Graz – dieser Song war dabei");
    expect(liveHint({ ...song, setlists: { "demo-mira": { date: "2026-01-02", songs: ["Anderes"] } } })).toBe(
      "Zuletzt live: 02.01.2026",
    );
    expect(liveHint({ ...song, setlists: undefined })).toBeNull();
  });
});

describe("Geocoding (Nominatim, echte Antworten)", () => {
  it("Stadt mit Ländercode bzw. Ländername; nichts gefunden → null", async () => {
    const { geocodeCity } = await import("@/lib/concerts/geocode");
    const linz = (await import("../fixtures/nominatim/linz.json")).default;
    const none = (await import("../fixtures/nominatim/not-found.json")).default;
    const http = vi.fn<Get>(async () => ok(linz));
    expect(await geocodeCity("Linz", "AT", http)).toEqual({ lat: 48.3059078, lon: 14.286198 });
    const u = new URL(http.mock.calls[0]![0]);
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ city: "Linz", countrycodes: "at", format: "jsonv2", limit: "1" });
    await geocodeCity("Linz", "Austria", http);
    expect(new URL(http.mock.calls[1]![0]).searchParams.get("country")).toBe("Austria");
    expect(await geocodeCity("Zzz", undefined, async () => ok(none))).toBeNull();
    await expect(geocodeCity("Linz", "AT", async () => ok({}, 429))).rejects.toThrow("429");
  });

  it("ergänzt fehlende Koordinaten mit Cache, Budget und Gedächtnis je Stadt", async () => {
    const { fillCoordinates } = await import("@/lib/concerts/geocode");
    const linz = (await import("../fixtures/nominatim/linz.json")).default;
    const cache = memoryCache();
    const http = vi.fn<Get>(async () => ok(linz));
    const events = [
      ev({ city: "Linz", country: "AT" }),
      ev({ city: "Linz", country: "AT", date: "2026-12-02" }), // gleiche Stadt → keine zweite Anfrage
      ev({ city: "Graz", lat: 47.07, lon: 15.44 }), // hat Koordinaten
      ev({ city: "Salzburg" }),
      ev({ city: "Innsbruck" }),
    ];
    const out = await fillCoordinates(events, { cache, http, max: 2 });
    expect(out[0]).toMatchObject({ lat: 48.3059078, geocoded: true });
    expect(out[1]).toMatchObject({ geocoded: true });
    expect(out[2]!.geocoded).toBeUndefined();
    expect(out[3]).toMatchObject({ geocoded: true }); // zweite (letzte) Abfrage im Budget
    expect(out[4]!.lat).toBeUndefined(); // Budget erschöpft → beim nächsten Mal
    expect(http).toHaveBeenCalledTimes(2);
    await fillCoordinates(events, { cache, http, max: 2 });
    expect(http).toHaveBeenCalledTimes(3); // Linz/Salzburg aus dem Cache, nur Innsbruck neu
    // Ausfall wird nicht gecacht
    const broken = vi.fn<Get>(async () => ok({}, 503));
    const c2 = memoryCache();
    await fillCoordinates([ev({ city: "Wels" })], { cache: c2, http: broken });
    await fillCoordinates([ev({ city: "Wels" })], { cache: c2, http: broken });
    expect(broken).toHaveBeenCalledTimes(2);
  });

  it("Entfernung aus geocodierten Orten wird markiert (Quellenangabe)", () => {
    const [c] = mergeEvents(
      { id: "a", name: "A" },
      [{ provider: { id: "x", ticketPriority: 1 }, events: [ev({ city: "Linz", lat: 48.3, lon: 14.29, geocoded: true })] }],
      {
        today: "2026-11-14",
        home: WIEN,
      },
    );
    expect(c).toMatchObject({ geocoded: true });
    expect(c!.distanceKm).toBeGreaterThan(150);
  });

  it("Dienst ergänzt Koordinaten vor dem Zusammenführen", async () => {
    const linz = (await import("../fixtures/nominatim/linz.json")).default;
    const p = { id: "oe", ticketPriority: 1, events: vi.fn(async () => [ev({ city: "Linz", country: "AT", provider: "oe" })]) };
    const svc = createConcertService({
      providers: [p],
      cache: memoryCache(),
      today: () => "2026-11-14",
      geoHttp: async () => ok(linz),
    });
    const r = await svc([{ id: "a1", name: "A" }]);
    expect(r.concerts[0]).toMatchObject({ city: "Linz", geocoded: true });
    expect(r.concerts[0]!.distanceKm).toBeGreaterThan(150);
  });
});

describe("Heimatort und Umkreis", () => {
  it("Ortssuche liefert Namen und Koordinaten (echte Antwort)", async () => {
    const { geocodePlace } = await import("@/lib/concerts/geocode");
    const linz = (await import("../fixtures/nominatim/linz.json")).default;
    const http = vi.fn<Get>(async () => ok(linz));
    expect(await geocodePlace("Linz", http)).toEqual({ name: "Linz", lat: 48.3059078, lon: 14.286198 });
    expect(new URL(http.mock.calls[0]![0]).searchParams.get("q")).toBe("Linz");
    expect(await geocodePlace("Zzz", async () => ok([]))).toBeNull();
  });

  it("Einstellungen pro Konto, wirksamer Bereich mit Standard", async () => {
    const { createPrefsStore, effectiveArea } = await import("@/lib/server/prefs-store");
    const store = createPrefsStore(memoryCache());
    expect(effectiveArea(await store.get("u1"))).toMatchObject({ name: "Wien", radiusKm: 200, custom: false });
    await store.set("u1", { home: { name: "Linz", lat: 48.3, lon: 14.29 }, radiusKm: 100 });
    expect(effectiveArea(await store.get("u1"))).toEqual({ name: "Linz", lat: 48.3, lon: 14.29, radiusKm: 100, custom: true });
    expect(effectiveArea(await store.get("u2"))).toMatchObject({ name: "Wien" });
    await expect(store.set("u1", { radiusKm: 3 })).rejects.toThrow(); // ungültig
  });

  it("Dienst rechnet Entfernungen vom eingestellten Ort und meldet den Bereich", async () => {
    const p = {
      id: "oe",
      ticketPriority: 1,
      events: vi.fn(async () => [
        ev({ city: "Linz", lat: 48.31, lon: 14.29 }),
        ev({ city: "Wien", date: "2026-12-02", lat: 48.21, lon: 16.37 }),
      ]),
    };
    const svc = createConcertService({ providers: [p], cache: memoryCache(), today: () => "2026-11-14" });
    const r = await svc([{ id: "a", name: "A" }], undefined, { name: "Linz", lat: 48.3059, lon: 14.2862, radiusKm: 50 });
    expect(r.area).toEqual({ name: "Linz", radiusKm: 50 });
    expect(r.concerts.map((c) => [c.city, c.distanceKm])).toEqual([
      ["Linz", 1], // ~0,5 km vom eingestellten Punkt
      ["Wien", 155],
    ]);
  });

  it("Karte nutzt den Umkreis des Bereichs", () => {
    const song = { ...fixtures.neonlicht!, concertArea: { name: "Linz", radiusKm: 2 } };
    const d = { section: "outro", lineActive: false } as Derived;
    const card = concertCardAt(song, d, 190_000)!;
    expect(card.near).toBe(false); // Wien (3 km) liegt nicht mehr im 2-km-Umkreis
    expect(card.area).toEqual({ name: "Linz", radiusKm: 2 });
  });
});
