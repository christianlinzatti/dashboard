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
  it("blättert bis zur letzten Seite (höchstens 2)", async () => {
    const page = { totalPages: 5, products: [] };
    const http = vi.fn<Http>(async () => ok(page));
    await oeticket(http).events("X");
    expect(http).toHaveBeenCalledTimes(2);
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
    expect(concertProviders({}).map((p) => p.id)).toEqual(["oeticket"]);
    expect(concertProviders({ OETICKET: "0" }).map((p) => p.id)).toEqual([]);
    expect(concertProviders({ TICKETMASTER_API_KEY: "k", BANDSINTOWN_APP_ID: "a" }).map((p) => p.id)).toEqual([
      "oeticket",
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
    await svc([{ id: "a1", name: "A" }]);
    expect(good.events).toHaveBeenCalledTimes(1); // Teilergebnis aus dem Cache
    expect(setSpy).toHaveBeenCalledWith("concerts:v1:a", expect.anything(), CACHE_TTL.concertsPartial);
    expect(setlistFetch).toHaveBeenCalledTimes(1);

    const cache2 = memoryCache();
    const setSpy2 = vi.spyOn(cache2, "set");
    const svc2 = createConcertService({ providers: [good], cache: cache2, today: () => "2026-11-14" });
    await svc2([{ id: "a1", name: "A" }]);
    await svc2([{ id: "a1", name: "A" }]);
    expect(good.events).toHaveBeenCalledTimes(2);
    expect(setSpy2).toHaveBeenCalledWith("concerts:v1:a", expect.anything(), CACHE_TTL.concerts);
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
    expect(daysUntil("2026-12-05", "2026-11-14")).toBe(21);
    expect(countdown("2026-11-14", "2026-11-14")).toBe("heute");
    expect(countdown("2026-11-15", "2026-11-14")).toBe("morgen");
    expect(countdown("2026-12-05", "2026-11-14")).toBe("in 21 Tagen");
    expect(countdown("2027-05-14", "2026-11-14")).toBe("in 6 Monaten");
    expect(todayLocal(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
  it("Karte in den letzten 15 s, Umkreis zuerst, Info-Karte weicht", () => {
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
