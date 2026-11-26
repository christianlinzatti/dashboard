import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { BRIDGE_USER_AGENT, createConcertFetcher, politeQueue } from "../../bridge/concerts.ts";
import { CONCERT_DEFAULTS, parseConfig } from "../../bridge/config.ts";
import { LampController } from "../../bridge/controller.ts";
import { createBridgeServer } from "../../bridge/server.ts";
import { askBridgeConcerts } from "@/lib/bridge/concerts";
import { normalizeName } from "@/lib/concerts/shared/eventim";
import { bridgeEvents, bridgeList, concertsRequest, safeTicketUrl, type BridgeList } from "@/lib/concerts/shared/protocol";
import { createConcertService } from "@/lib/concerts/service";
import { memoryCache } from "@/lib/lyrics/cache";
import { normalizeLine } from "@/lib/lyrics/text";
import type { RawEvent } from "@/lib/concerts/types";
import { loadConcerts } from "@/lib/concerts/load";
import type { SongStatic } from "@/lib/song-context/schema";
import roy from "../fixtures/oeticket/roy-bianco.json";

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("Warteschlange mit zufälliger Pause", () => {
  it("Anfragen nacheinander, dazwischen Abstand plus Zufall; ein Fehler hält die Schlange nicht an", async () => {
    let t = 0;
    const waits: number[] = [];
    const order: string[] = [];
    const http = vi.fn(async (url: string) => {
      order.push(`start ${url}@${t}`);
      t += 100; // jede Anfrage dauert 100 ms
      if (url === "b") throw new Error("kaputt");
      return ok({});
    });
    const randoms = [0.5, 0, 1];
    const q = politeQueue(http, {
      gapMs: 1000,
      jitterMs: 2000,
      now: () => t,
      random: () => randoms.shift() ?? 0,
      sleep: async (ms) => {
        waits.push(Math.round(ms));
        t += ms;
      },
    });
    const all = await Promise.allSettled([q("a"), q("b"), q("c"), q("d")]);
    expect(all.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled", "fulfilled"]);
    // erste sofort; danach 1000 + Zufall·2000 nach dem Ende der vorigen
    expect(waits).toEqual([1000, 3000, 1000]);
    expect(order).toEqual(["start a@0", "start b@1100", "start c@4200", "start d@5300"]);
  });

  it("abgebrochene Anfrage in der Schlange geht nicht mehr hinaus", async () => {
    const http = vi.fn(async () => ok({}));
    const q = politeQueue(http, { gapMs: 10, jitterMs: 0, sleep: async () => undefined });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(q("x", { signal: ctrl.signal })).rejects.toBeDefined();
    expect(http).not.toHaveBeenCalled();
  });
});

describe("Konzertabfrage der Bridge", () => {
  it("beide Shops je Künstler, Ergebnis gemerkt, gleichzeitige Anfragen nur einmal, 403 erklärt", async () => {
    let t = 0;
    const http = vi.fn(async (url: string) => {
      const shop = new URL(url).searchParams.get("webId");
      return shop === "web__eventim-de" ? ok({}, 403) : ok(roy);
    });
    const f = createConcertFetcher({ shops: ["oeticket", "eventim"], http, now: () => t });
    const name = "Roy Bianco & Die Abbrunzati Boys";
    const [a, b] = await Promise.all([f.lookup([name]), f.lookup([name])]);
    expect(a).toEqual(b);
    expect(http).toHaveBeenCalledTimes(2); // nicht vier
    const [oe, de] = a;
    expect(oe).toMatchObject({ artist: name, provider: "oeticket", state: "ok", cached: false });
    expect(oe!.events.length).toBeGreaterThan(0);
    expect(oe!.events[0]).not.toHaveProperty("provider");
    expect(de).toMatchObject({ provider: "eventim", state: "fehler", error: expect.stringContaining("Bot-Schutz") });
    // Ergebnisse sind gültig für den Server
    expect(a.every((l) => bridgeList.safeParse(l).success)).toBe(true);

    // gemerkt: ok 12 h, Fehler 30 min
    t += 31 * 60_000;
    const again = await f.lookup([name]);
    expect(again[0]).toMatchObject({ cached: true });
    expect(again[1]).toMatchObject({ cached: false });
    expect(http).toHaveBeenCalledTimes(3);
    // ohne Cache
    await f.lookup([name], true);
    expect(http).toHaveBeenCalledTimes(5);
    expect(f.status()).toMatchObject({ shops: ["oeticket", "eventim"], cached: 2, running: 0 });
  });

  it("Konfiguration: ohne Eintrag an, beide Shops, 1 s plus bis 1,5 s Pause; Abstand mindestens 0,5 s", () => {
    expect(CONCERT_DEFAULTS).toEqual({ enabled: true, shops: ["oeticket", "eventim"], gapMs: 1000, jitterMs: 1500, maxPages: 8 });
    const base = { allowedOrigins: ["https://x.example"], lamps: [{ name: "L", role: "puls", ip: "1.2.3.4" }] };
    expect(parseConfig(base).concerts).toBeUndefined();
    expect(parseConfig({ ...base, concerts: { shops: ["oeticket"] } }).concerts).toMatchObject({
      shops: ["oeticket"],
      gapMs: 1000,
    });
    expect(() => parseConfig({ ...base, concerts: { gapMs: 10 } })).toThrow();
    expect(BRIDGE_USER_AGENT).toBe(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36",
    );
  });
});

describe("Bridge-Server: Konzert-Nachricht", () => {
  const cleanups: Array<() => unknown> = [];
  afterEach(async () => {
    for (const c of cleanups.splice(0)) await c();
  });
  const origin = "https://dashboard.example";
  const controller = () => new LampController([], () => undefined);

  async function connect(port: number) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin });
    cleanups.push(() => ws.close());
    await new Promise((r) => ws.once("open", r));
    const next = () => new Promise<Record<string, unknown>>((r) => ws.once("message", (d) => r(JSON.parse(String(d)))));
    return { ws, next };
  }

  it("antwortet mit der passenden ID; abgeschaltet → off", async () => {
    const list: BridgeList = { artist: "A", provider: "oeticket", state: "ok", events: [], cached: false };
    const lookup = vi.fn(async () => [list]);
    const concerts = {
      shops: ["oeticket" as const],
      lookup,
      status: () => ({ shops: ["oeticket" as const], cached: 0, running: 0 }),
    };
    const bridge = await createBridgeServer({ port: 0, allowedOrigins: [origin], controller: controller(), concerts });
    cleanups.push(bridge.close);
    const { ws, next } = await connect(bridge.port);
    ws.send(JSON.stringify({ type: "concerts", id: "x1", artists: ["A"] }));
    expect(await next()).toEqual({ type: "concerts", id: "x1", results: [list] });
    expect(lookup).toHaveBeenCalledWith(["A"], undefined);
    ws.send(JSON.stringify({ type: "concerts", id: "x2", artists: [] })); // ungültig → keine Antwort
    ws.send(JSON.stringify({ type: "concerts", id: "x3", artists: ["B"], fresh: true }));
    expect(await next()).toMatchObject({ id: "x3" });
    const status = await (await fetch(`http://127.0.0.1:${bridge.port}/status`)).json();
    expect(status.concerts).toEqual({ shops: ["oeticket"], cached: 0, running: 0 });

    const off = await createBridgeServer({ port: 0, allowedOrigins: [origin], controller: controller() });
    cleanups.push(off.close);
    const o = await connect(off.port);
    o.ws.send(JSON.stringify({ type: "concerts", id: "y", artists: ["A"] }));
    expect(await o.next()).toEqual({ type: "concerts", id: "y", results: [], off: true });
  });

  it("höchstens 3 Abfragen gleichzeitig, weitere bekommen eine leere Antwort", async () => {
    const release: Array<() => void> = [];
    const lookup = vi.fn(() => new Promise<BridgeList[]>((r) => release.push(() => r([]))));
    const concerts = {
      shops: ["oeticket" as const],
      lookup,
      status: () => ({ shops: ["oeticket" as const], cached: 0, running: 0 }),
    };
    const bridge = await createBridgeServer({ port: 0, allowedOrigins: [origin], controller: controller(), concerts });
    cleanups.push(bridge.close);
    const { ws, next } = await connect(bridge.port);
    for (const id of ["1", "2", "3", "4"]) ws.send(JSON.stringify({ type: "concerts", id, artists: ["A"] }));
    expect(await next()).toEqual({ type: "concerts", id: "4", results: [] });
    expect(lookup).toHaveBeenCalledTimes(3);
    release.forEach((r) => r());
  });
});

type FakeSock = {
  readyState: number;
  sent: string[];
  send(d: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
};
function fakeSocket() {
  const s: FakeSock = {
    readyState: 0,
    sent: [],
    send: (d) => void s.sent.push(d),
    close: vi.fn(),
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  };
  return s;
}

describe("Kiosk fragt die Bridge", () => {
  beforeEach(() => vi.useRealTimers());

  it("schickt die Künstler, nimmt nur die eigene Antwort und schließt die Verbindung", async () => {
    const s = fakeSocket();
    const p = askBridgeConcerts("ws://bridge", ["A", "B", "C", "D", "E", "F"], { createSocket: () => s, fresh: true });
    s.onopen!();
    const req = concertsRequest.parse(JSON.parse(s.sent[0]!));
    expect(req).toMatchObject({ artists: ["A", "B", "C", "D", "E"], fresh: true });
    const list = { artist: "A", provider: "oeticket", state: "ok", events: [], cached: true };
    s.onmessage!({ data: JSON.stringify({ type: "concerts", id: "fremd", results: [] }) });
    s.onmessage!({ data: "kein json" });
    s.onmessage!({ data: JSON.stringify({ type: "concerts", id: req.id, results: [list] }) });
    expect(await p).toEqual([list]);
    expect(s.close).toHaveBeenCalled();
  });

  it("ohne Bridge, abgeschaltet, Zeitüberschreitung oder Abbruch → null", async () => {
    const s1 = fakeSocket();
    const p1 = askBridgeConcerts("ws://x", ["A"], { createSocket: () => s1 });
    s1.onerror!();
    expect(await p1).toBeNull();

    const s2 = fakeSocket();
    const p2 = askBridgeConcerts("ws://x", ["A"], { createSocket: () => s2 });
    s2.onopen!();
    const id = JSON.parse(s2.sent[0]!).id;
    s2.onmessage!({ data: JSON.stringify({ type: "concerts", id, results: [], off: true }) });
    expect(await p2).toBeNull();

    vi.useFakeTimers();
    const p3 = askBridgeConcerts("ws://x", ["A"], { createSocket: () => fakeSocket(), timeoutMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect(await p3).toBeNull();
    vi.useRealTimers();

    const ctrl = new AbortController();
    const p4 = askBridgeConcerts("ws://x", ["A"], { createSocket: () => fakeSocket(), signal: ctrl.signal });
    ctrl.abort();
    expect(await p4).toBeNull();
  });
});

describe("Bridge-Ergebnisse auf dem Server", () => {
  it("Ticket-Links nur zu oeticket/eventim per https", () => {
    expect(safeTicketUrl("https://www.oeticket.com/event/x")).toBe("https://www.oeticket.com/event/x");
    expect(safeTicketUrl("https://www.eventim.de/event/y")).toBeDefined();
    expect(safeTicketUrl("http://www.oeticket.com/x")).toBeUndefined();
    expect(safeTicketUrl("https://oeticket.com.boese.example/x")).toBeUndefined();
    expect(safeTicketUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeTicketUrl("kaputt")).toBeUndefined();
  });

  it("Listen werden geprüft: falsches Datum, fremde Quelle, zu viele Termine abgelehnt; Künstler aus der Liste", () => {
    const e = { date: "2099-05-01", venue: "Halle", city: "Wien", ticketUrl: "https://boese.example/" };
    const l = bridgeList.parse({
      artist: "A",
      provider: "eventim",
      state: "ok",
      events: [{ ...e, provider: "x", artistName: "Z" }],
    });
    expect(bridgeEvents(l)).toEqual([{ ...e, provider: "eventim", artistName: "A", ticketUrl: undefined }]);
    expect(bridgeList.safeParse({ ...l, provider: "ticketmaster" }).success).toBe(false);
    expect(bridgeList.safeParse({ ...l, events: [{ ...e, date: "morgen" }] }).success).toBe(false);
    expect(bridgeList.safeParse({ ...l, events: Array(301).fill(e) }).success).toBe(false);
  });

  it("Namensvergleich wie im übrigen Projekt", () => {
    for (const s of ["Beyoncé", "AC/DC", "Wanda (Live)", "  Roy  Bianco & Die Abbrunzati Boys ", "Sigur Rós"])
      expect(normalizeName(s)).toBe(normalizeLine(s));
  });

  it("Dienst: Quellen der Bridge fragt der Server nicht, eigener Cache-Eintrag; Bridge-Termine zusammengeführt", async () => {
    const ev = (o: Partial<RawEvent>): RawEvent => ({
      provider: "p",
      artistName: "A",
      date: "2099-01-01",
      venue: "V",
      city: "Wien",
      lat: 48.2,
      lon: 16.37,
      ...o,
    });
    const oe = { id: "oeticket", ticketPriority: 1, events: vi.fn(async () => [ev({ provider: "oeticket" })]) };
    const tm = {
      id: "ticketmaster",
      ticketPriority: 2,
      events: vi.fn(async () => [ev({ provider: "ticketmaster", ticketUrl: "https://tm/x" })]),
    };
    const cache = memoryCache();
    const setSpy = vi.spyOn(cache, "set");
    const svc = createConcertService({ providers: [oe, tm], cache, today: () => "2026-11-26" });

    const first = await svc([{ id: "a", name: "A" }], undefined, undefined, { skip: ["oeticket", "eventim"] });
    expect(oe.events).not.toHaveBeenCalled();
    expect(first.providers).toEqual(["ticketmaster"]);
    expect(setSpy).toHaveBeenCalledWith("concerts:v2:a:ohne-oeticket", expect.anything(), expect.any(Number));

    const bridge: BridgeList[] = [
      {
        artist: "A",
        provider: "oeticket",
        state: "ok",
        events: [{ date: "2099-01-01", venue: "V", city: "Wien", ticketUrl: "https://www.oeticket.com/e/1" }],
        cached: true,
        ms: 1200,
      },
      { artist: "A", provider: "eventim", state: "fehler", events: [], cached: false, error: "eventim 403" },
      {
        artist: "Andere",
        provider: "oeticket",
        state: "ok",
        events: [{ date: "2099-02-02", venue: "W", city: "Graz" }],
        cached: false,
      },
    ];
    const r = await svc([{ id: "a", name: "A" }], undefined, undefined, { bridge });
    expect(oe.events).not.toHaveBeenCalled();
    expect(tm.events).toHaveBeenCalledTimes(1); // aus dem Cache von eben
    expect(r.providers).toEqual(["ticketmaster", "oeticket (Pi)", "eventim (Pi)"]);
    expect(r.concerts).toHaveLength(1);
    // oeticket-Link bevorzugt, beide Quellen genannt
    expect(r.concerts[0]).toMatchObject({
      ticketUrl: "https://www.oeticket.com/e/1",
      providers: expect.arrayContaining(["oeticket", "ticketmaster"]),
    });
    expect(r.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "oeticket", state: "ok", via: "pi", cached: true, events: 1 }),
        expect.objectContaining({ provider: "eventim", state: "fehler", via: "pi", error: "eventim 403" }),
      ]),
    );
    expect(r.sources.some((s) => s.artist === "Andere")).toBe(false);

    // ohne Bridge wie bisher: der Server fragt selbst
    await svc([{ id: "a", name: "A" }]);
    expect(oe.events).toHaveBeenCalledTimes(1);
  });
});

describe("/api/concerts POST", () => {
  const concertsFor = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    concertsFor
      .mockReset()
      .mockResolvedValue({ concerts: [], setlists: {}, providers: [], area: { name: "Wien", radiusKm: 200 }, sources: [] });
    vi.doMock("@/lib/concerts/service", () => ({ concertsFor }));
    vi.doMock("@/lib/server/prefs-store", () => ({
      prefsStore: () => ({ get: async () => null }),
      effectiveArea: () => ({ name: "Wien", lat: 48.2, lon: 16.37, radiusKm: 200 }),
    }));
  });
  afterEach(() => vi.doUnmock("@/lib/server/session"));

  const post = async (body: unknown, session = true) => {
    vi.resetModules();
    vi.doMock("@/lib/server/session", () => ({ readSession: async () => (session ? { uid: "u" } : null) }));
    const { POST } = await import("@/app/api/concerts/route");
    const { NextRequest } = await import("next/server");
    return POST(
      new NextRequest("http://x/api/concerts", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }),
    );
  };
  const get = async (qs: string) => {
    vi.doMock("@/lib/server/session", () => ({ readSession: async () => ({ uid: "u" }) }));
    const { GET } = await import("@/app/api/concerts/route");
    const { NextRequest } = await import("next/server");
    return GET(new NextRequest(`http://x/api/concerts?${qs}`));
  };

  it("nimmt geprüfte Bridge-Listen an", async () => {
    const bridge = [{ artist: "A", provider: "oeticket", state: "ok", events: [], cached: false }];
    expect((await post({ ids: ["1"], names: ["A"], bridge })).status).toBe(200);
    expect(concertsFor).toHaveBeenCalledWith([{ id: "1", name: "A" }], undefined, expect.anything(), { bridge });
    expect((await post({ ids: ["1"], names: ["A"], bridge }, false)).status).toBe(401);
    expect((await post({ ids: ["1"], names: ["A"], bridge: [{ ...bridge[0], provider: "bandsintown" }] })).status).toBe(400);
    expect((await post("kein json")).status).toBe(400);
    expect((await post("x".repeat(600 * 1024))).status).toBe(413);
  });

  it("GET mit `ohne`: nur bekannte Bridge-Quellen werden ausgelassen", async () => {
    expect((await get("ids=1&names=A&ohne=oeticket,eventim,ticketmaster")).status).toBe(200);
    expect(concertsFor.mock.calls[0]![3]).toEqual({ skip: ["oeticket", "eventim"] });
    await get("ids=1&names=A");
    expect(concertsFor.mock.calls[1]![3]).toEqual({ skip: [] });
  });
});

describe("Konzerte laden (Kiosk)", () => {
  const song = { artists: [{ spotifyId: "s1", name: "Wanda" }] } as unknown as SongStatic;
  const answer = (n: number) => ({ concerts: Array(n).fill({}), setlists: {} });
  const list: BridgeList = { artist: "Wanda", provider: "oeticket", state: "ok", events: [], cached: false };
  const setup = (bridge: BridgeList[] | null, viaBridge = true) => {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return ok(answer(calls.length));
    });
    const shown: number[] = [];
    const warnings: string[] = [];
    const run = loadConcerts(song, {
      viaBridge,
      signal: new AbortController().signal,
      fetch: fetchMock as unknown as typeof fetch,
      askBridge: async () => bridge,
      show: (a) => shown.push(a.concerts.length),
      warn: (m) => warnings.push(m),
    });
    return { run, calls, shown, warnings };
  };

  it("mit Bridge: erst ohne oeticket/eventim vom Server, dann mit den Listen der Bridge", async () => {
    const t = setup([list]);
    await t.run;
    expect(new URL(t.calls[0]!.url, "http://x").searchParams.get("ohne")).toBe("oeticket,eventim");
    expect(t.calls[1]).toMatchObject({
      url: "/api/concerts",
      method: "POST",
      body: { ids: ["s1"], names: ["Wanda"], bridge: [list] },
    });
    expect(t.shown).toEqual([1, 2]);
  });

  it("ohne Bridge nur GET; Bridge stumm → Server wie bisher; Bridge ausgelastet → nichts weiter", async () => {
    const none = setup(null, false);
    await none.run;
    expect(none.calls).toHaveLength(1);
    expect(new URL(none.calls[0]!.url, "http://x").searchParams.has("ohne")).toBe(false);

    const silent = setup(null);
    await silent.run;
    expect(silent.calls).toHaveLength(2);
    expect(new URL(silent.calls[1]!.url, "http://x").searchParams.has("ohne")).toBe(false);
    expect(silent.warnings[0]).toMatch(/Pi-Bridge/);

    const busy = setup([]);
    await busy.run;
    expect(busy.calls).toHaveLength(1);
    expect(busy.warnings).toEqual([]);
  });
});

describe("Kiosk ↔ Bridge zusammen", () => {
  it("echter Bridge-Server mit Warteschlange, Kiosk-Client bekommt geprüfte Listen", async () => {
    const origin = "https://dashboard.example";
    const seen: Array<string | null> = [];
    const http = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("user-agent"));
      return ok(roy);
    });
    const concerts = createConcertFetcher({
      shops: ["oeticket", "eventim"],
      http: politeQueue((url, init) => http(url, { ...init, headers: { "User-Agent": BRIDGE_USER_AGENT } }), {
        gapMs: 5,
        jitterMs: 5,
      }),
    });
    const bridge = await createBridgeServer({
      port: 0,
      allowedOrigins: [origin],
      controller: new LampController([], () => undefined),
      concerts,
    });
    try {
      const lists = await askBridgeConcerts(`ws://127.0.0.1:${bridge.port}`, ["Roy Bianco & Die Abbrunzati Boys"], {
        createSocket: (u) => new WebSocket(u, { origin }) as never,
        timeoutMs: 5000,
      });
      expect(lists?.map((l) => [l.provider, l.state])).toEqual([
        ["oeticket", "ok"],
        ["eventim", "ok"],
      ]);
      expect(lists!.every((l) => bridgeList.safeParse(l).success)).toBe(true);
      expect(seen.every((ua) => ua === BRIDGE_USER_AGENT)).toBe(true);
    } finally {
      await bridge.close();
    }
  });
});
