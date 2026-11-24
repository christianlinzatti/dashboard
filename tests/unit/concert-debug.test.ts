import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyRaw, failureMessages } from "@/lib/concerts/debug";
import { errorText } from "@/lib/concerts/service";
import { diagnose } from "@/lib/debug/diagnose";
import type { RawEvent } from "@/lib/concerts/types";
import type { Concert } from "@/lib/song-context/schema";

const ev = (p: Partial<RawEvent>): RawEvent => ({
  provider: "oeticket",
  artistName: "A",
  date: "2026-12-01",
  venue: "V",
  city: "Wien",
  ...p,
});
const concert = (p: Partial<Concert>): Concert =>
  ({ artistId: "a", artistName: "A", date: "2026-12-01", venue: "V", city: "Wien", providers: ["oeticket"], ...p }) as Concert;

describe("Konzerttermine in /debug", () => {
  it("jeder Rohtermin mit dem, was aus ihm wurde", () => {
    const rows = classifyRaw(
      "A",
      [
        {
          events: [
            ev({ date: "2026-11-01" }),
            ev({ date: "2026-12-01" }),
            ev({ date: "2027-01-05", city: "Graz", cancelled: true }),
            ev({ date: "2027-09-01", city: "Berlin" }),
          ],
        },
        {
          events: [
            ev({ provider: "eventim", date: "2026-12-01", city: "WIEN" }),
            ev({ provider: "eventim", date: "2027-01-05", city: "Graz" }),
          ],
        },
      ],
      [concert({ distanceKm: 3 }), concert({ artistName: "B", date: "2027-09-01", city: "Berlin" })],
      "2026-11-24",
    );
    expect(rows.map((r) => [r.date, r.provider, r.outcome])).toEqual([
      ["2026-11-01", "oeticket", "vergangen"],
      ["2026-12-01", "eventim", "gezeigt"],
      ["2026-12-01", "oeticket", "gezeigt"],
      ["2027-01-05", "eventim", "abgesagt"], // eine Quelle meldet abgesagt → für alle weg
      ["2027-01-05", "oeticket", "abgesagt"],
      ["2027-09-01", "oeticket", "nicht unter den ersten 5"], // Berlin steht nur bei Künstler B
    ]);
    expect(rows[1]!.distanceKm).toBe(3);
  });

  it("ausgefallene Quellen: je Quelle eine Zeile mit den Künstlern", () => {
    expect(
      failureMessages([
        { artist: "A", provider: "oeticket", state: "fehler", error: "oeticket 403" },
        { artist: "B", provider: "oeticket", state: "fehler", error: "oeticket 403" },
        { artist: "A", provider: "eventim", state: "ok" },
      ]),
    ).toEqual(["oeticket (A, B): oeticket 403"]);
  });

  it("fehlende Schlüssel werden genannt", async () => {
    const { missingConcertSources } = await vi.importActual<typeof import("@/lib/concerts/service")>("@/lib/concerts/service");
    expect(missingConcertSources({}).map((m) => m.id)).toEqual(["ticketmaster", "setlist.fm"]);
    expect(missingConcertSources({ TICKETMASTER_API_KEY: "k", SETLISTFM_API_KEY: "s" })).toEqual([]);
  });

  it("Fehlertext: Bot-Sperre erklärt, Zeitüberschreitung, keine Schlüssel", () => {
    expect(errorText(new Error("oeticket 403"))).toBe("oeticket 403 – Zugriff gesperrt (Bot-Schutz der Quelle)");
    expect(errorText(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe("Zeitüberschreitung (8 s)");
    expect(errorText(new Error("GET https://x/?apikey=GEHEIM&q=1 failed"))).not.toContain("GEHEIM");
    expect(errorText("kaputt")).toBe("kaputt");
  });

  it("Kurzdiagnose: Termine, Umkreis, fehlende Quelle", () => {
    const find = (song: object) => diagnose({ song } as Parameters<typeof diagnose>[0]).find((f) => f.label === "Konzerte");
    expect(find({})).toMatchObject({ value: "noch nicht geladen", level: "info" });
    expect(
      find({
        concerts: [{ distanceKm: 3 }, { distanceKm: 500 }, {}],
        concertArea: { name: "Wien", radiusKm: 200 },
        status: { concerts: { state: "ok" } },
      }),
    ).toMatchObject({ value: "3 Termine · 1 im Umkreis von 200 km um Wien", level: "ok" });
    expect(
      find({ concerts: [], status: { concerts: { state: "ok", detail: "Quelle fehlt: oeticket (A): 403" } } }),
    ).toMatchObject({
      value: "0 Termine · 0 im Umkreis von 200 km · Quelle fehlt: oeticket (A): 403",
      level: "warnung",
    });
  });
});

describe("/api/concerts/debug", () => {
  const concertsFor = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    concertsFor.mockReset();
    vi.doMock("@/lib/concerts/service", () => ({
      concertsFor,
      missingConcertSources: () => [{ id: "ticketmaster", hint: "fehlt" }],
    }));
    vi.doMock("@/lib/server/session", () => ({ readSession: async () => ({ uid: "u" }) }));
    vi.doMock("@/lib/server/prefs-store", () => ({
      prefsStore: () => ({ get: async () => null }),
      effectiveArea: () => ({ name: "Wien", lat: 48.2, lon: 16.37, radiusKm: 200 }),
    }));
  });
  afterEach(() => vi.doUnmock("@/lib/server/session"));

  const call = async (qs: string) => {
    const { GET } = await import("@/app/api/concerts/debug/route");
    const { NextRequest } = await import("next/server");
    return GET(new NextRequest(`http://x/api/concerts/debug?${qs}`));
  };

  it("Künstler aus der Liste (höchstens 5, ohne Doppelte), Rohtermine eingeordnet; frisch höchstens alle 15 s", async () => {
    concertsFor.mockResolvedValue({
      concerts: [concert({ artistName: "Wanda" })],
      setlists: {},
      providers: ["oeticket"],
      area: { name: "Wien", radiusKm: 200 },
      sources: [{ artist: "Wanda", provider: "oeticket", state: "ok", events: 1, cached: false }],
      raw: [{ artist: "Wanda", provider: "oeticket", events: [ev({ artistName: "Wanda", date: "2099-12-01" })] }],
    });
    const res = await call("names=Wanda,%20Wanda,B,C,D,E,F&fresh=1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(concertsFor.mock.calls[0]![0].map((a: { name: string }) => a.name)).toEqual(["Wanda", "B", "C", "D", "E"]);
    expect(concertsFor.mock.calls[0]![3]).toEqual({ raw: true, fresh: true });
    expect(body.fresh).toBe(true);
    expect(body.missing).toEqual([{ id: "ticketmaster", hint: "fehlt" }]);
    expect(body.raw[0].rows[0].outcome).toBe("nicht unter den ersten 5");
    const again = await (await call("names=Wanda&fresh=1")).json();
    expect(again.fresh).toBe(false); // zu schnell: aus dem Cache
  });

  it("ohne Anmeldung 401, ohne Künstler 400", async () => {
    expect((await call("names=%20,%20")).status).toBe(400);
    expect((await call("")).status).toBe(400);
    vi.doMock("@/lib/server/session", () => ({ readSession: async () => null }));
    vi.resetModules();
    expect((await call("names=A")).status).toBe(401);
  });
});

describe("Kurzdiagnose: Infos & Fotos", () => {
  const find = (song: object) => diagnose({ song } as Parameters<typeof diagnose>[0]).find((f) => f.label === "Infos & Fotos");
  it("Fotos je Quelle, ausgefallene Quelle mit Tipp", () => {
    expect(find({})).toMatchObject({ value: "noch nicht geladen", level: "info" });
    expect(
      find({
        status: { info: { state: "ok" } },
        info: { photos: [{ source: "commons" }, { source: "theaudiodb" }, { source: "theaudiodb" }] },
      }),
    ).toMatchObject({ value: "3 Fotos (Wikipedia 1, TheAudioDB 2)", level: "ok" });
    const throttled = find({
      status: { info: { state: "ok", detail: "Quelle fehlt: Wanda – Wikipedia: de.wikipedia.org ausgelastet (429)" } },
      info: { photos: [{ source: "theaudiodb" }] },
    });
    expect(throttled?.level).toBe("warnung");
    expect(throttled?.value).toContain("INFO_CONTACT");
    expect(find({ status: { info: { state: "missing" } } })?.value).toBe("nichts gefunden");
  });
});
