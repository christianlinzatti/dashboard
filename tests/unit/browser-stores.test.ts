import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** localStorage-Ersatz: Map im Speicher, optional mit Fehlern wie im privaten Modus */
function fakeStorage(fail = false) {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => {
      if (fail) throw new Error("SecurityError");
      return data.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (fail) throw new Error("QuotaExceededError");
      data.set(k, v);
    },
  };
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const song = (trackKey: string, at: number) => ({ trackKey, title: trackKey, artist: "Wanda", durationMs: 200_000, at });

describe("Rückblick: Protokoll im Browser", () => {
  it("merkt Songs, ergänzt Phase/Like, überlebt einen Neustart (localStorage)", async () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const { recapStore } = await import("@/lib/show/recap");
    const s = recapStore.getState();
    s.start(song("a", 1000));
    s.start(song("a", 2000)); // derselbe Song direkt nacheinander: nur einmal
    s.start(song("b", 3000));
    s.update("a", { liked: true, phase: undefined });
    s.update("b", { phase: "hoehepunkt" });
    s.update("gibtsnicht", { liked: true });
    expect(recapStore.getState().log.map((e) => [e.trackKey, e.liked, e.phase])).toEqual([
      ["a", true, undefined],
      ["b", undefined, "hoehepunkt"],
    ]);
    // gleicher Stand: kein erneutes Speichern
    const saved = storage.data.get("ss_abend");
    s.update("b", { phase: "hoehepunkt" });
    expect(storage.data.get("ss_abend")).toBe(saved);

    vi.resetModules();
    const again = (await import("@/lib/show/recap")).recapStore;
    again.getState().hydrate();
    expect(again.getState().log).toHaveLength(2);
  });

  it("nach langer Pause beginnt ein neuer Abend; kaputter Speicher ergibt ein leeres Protokoll", async () => {
    const storage = fakeStorage();
    storage.data.set("ss_abend", JSON.stringify([{ trackKey: "alt", at: 0 }, null, { kaputt: true }]));
    vi.stubGlobal("localStorage", storage);
    const { recapStore, NEW_EVENING_MS } = await import("@/lib/show/recap");
    recapStore.getState().hydrate();
    expect(recapStore.getState().log.map((e) => e.trackKey)).toEqual(["alt"]);
    recapStore.getState().start(song("neu", NEW_EVENING_MS + 1));
    expect(recapStore.getState().log.map((e) => e.trackKey)).toEqual(["neu"]);

    storage.data.set("ss_abend", "{kein json");
    recapStore.getState().hydrate();
    expect(recapStore.getState().log).toEqual([]);
    storage.data.set("ss_abend", '{"kein":"array"}');
    recapStore.getState().hydrate();
    expect(recapStore.getState().log).toEqual([]);
  });

  it("privater Modus: funktioniert ohne Speicher weiter", async () => {
    vi.stubGlobal("localStorage", fakeStorage(true));
    const { recapStore } = await import("@/lib/show/recap");
    recapStore.getState().hydrate();
    recapStore.getState().start(song("a", 1));
    recapStore.getState().update("a", { finished: true });
    expect(recapStore.getState().log[0]?.finished).toBe(true);
  });
});

describe("Lyrics-Versatz: Speicher je Gerät", () => {
  it("von Hand in 50-ms-Schritten, Gerät und Song addieren sich, Neustart lädt Hand und Gerät", async () => {
    const storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    const { offsetStore, totalOffset } = await import("@/lib/lyrics/offset-store");
    const s = offsetStore.getState();
    s.changeManual(120);
    s.changeManual(-30);
    s.setDevice(180);
    s.setSong("t1", -400);
    s.setMeasured({ trackKey: "t1", song: -400, n: 6, spreadMs: 40 });
    const st = offsetStore.getState();
    expect(st.manual).toBe(50); // 120 → 100, dann −30 → 50
    expect(totalOffset(st)).toBe(50 + 180 - 400);
    expect(st.measured?.n).toBe(6);

    vi.resetModules();
    const again = (await import("@/lib/lyrics/offset-store")).offsetStore;
    again.getState().hydrate();
    expect([again.getState().manual, again.getState().device, again.getState().song]).toEqual([50, 180, 0]);
  });

  it("privater Modus oder Unsinn im Speicher: 0", async () => {
    vi.stubGlobal("localStorage", fakeStorage(true));
    const { offsetStore } = await import("@/lib/lyrics/offset-store");
    offsetStore.getState().hydrate();
    offsetStore.getState().changeManual(50);
    offsetStore.getState().setDevice(20);
    expect([offsetStore.getState().manual, offsetStore.getState().device]).toEqual([50, 20]);
    offsetStore.getState().hydrate();
    expect([offsetStore.getState().manual, offsetStore.getState().device]).toEqual([0, 0]);

    const storage = fakeStorage();
    storage.data.set("ss_lyrics_offset", "abc");
    vi.stubGlobal("localStorage", storage);
    offsetStore.getState().hydrate();
    expect(offsetStore.getState().manual).toBe(0);
  });
});

describe("Kiosk-Protokoll im Browser", () => {
  it("fängt globale Fehler ab, sendet alle 15 s und beim Verlassen; Aufräumen löst alles", async () => {
    vi.useFakeTimers();
    const win = new EventTarget();
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}"));
    vi.stubGlobal("window", win);
    vi.stubGlobal("fetch", fetchMock);
    const { installTelemetry, report } = await import("@/lib/live/telemetry");

    report("fehler", "vorher", "ohne Installation: nichts"); // darf nichts tun
    const off = installTelemetry();
    const error = Object.assign(new Event("error"), {
      message: "Uncaught TypeError: x is undefined",
      filename: "https://kiosk/_next/static/chunks/app.js",
      lineno: 12,
    });
    win.dispatchEvent(error);
    win.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new Error("weg") }));
    win.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "Text" }));
    report("info", "fps", "58 fps");

    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/log");
    expect(init.keepalive).toBe(true);
    const sent = JSON.parse(String(init.body)) as { entries: Array<{ message: string; source: string }> };
    expect(sent.entries.map((e) => e.message)).toEqual([
      "TypeError: x is undefined (app.js:12)",
      "Unbehandelt: weg",
      "Unbehandelt: Text",
      "58 fps",
    ]);

    // beim Verlassen der Seite sofort senden
    win.dispatchEvent(Object.assign(new Event("error"), { message: "später", filename: "" }));
    win.dispatchEvent(new Event("pagehide"));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1].body)).entries[0].message).toBe("später");

    off();
    win.dispatchEvent(Object.assign(new Event("error"), { message: "nach dem Aufräumen", filename: "" }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
