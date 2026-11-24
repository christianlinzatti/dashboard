import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** localStorage im Speicher (Node hat keinen) */
function fakeStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

describe("Gemerkt im Browser", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("Konzert-Erinnerungen: speichern, beim Laden Vergangenes aufräumen, kaputte Einträge ignorieren", async () => {
    const store = fakeStorage();
    const { reminderStore } = await import("@/lib/concerts/reminders");
    const r = (date: string) => ({
      key: `W|${date}|wien`,
      artistName: "W",
      date,
      city: "Wien",
      venue: "V",
      reason: "folgst" as const,
    });
    reminderStore.getState().add([], "2026-11-24"); // nichts zu tun
    expect(store.has("ss_konzert_erinnerung")).toBe(false);
    reminderStore.getState().add([r("2026-12-19"), r("2026-11-01")], "2026-11-24");
    expect(JSON.parse(store.get("ss_konzert_erinnerung")!).map((x: { date: string }) => x.date)).toEqual(["2026-12-19"]);
    store.set("ss_konzert_erinnerung", JSON.stringify([r("2026-12-19"), r("2026-12-01"), { kaputt: 1 }, null]));
    reminderStore.getState().hydrate("2026-12-05");
    expect(reminderStore.getState().list.map((x) => x.date)).toEqual(["2026-12-19"]);
    store.set("ss_konzert_erinnerung", "{kein json");
    reminderStore.getState().hydrate("2026-12-05");
    expect(reminderStore.getState().list).toEqual([]);
  });

  it("Fotos des Abends: merken (nur abrufbare, höchstens 30), kaputte Daten ignorieren", async () => {
    const store = fakeStorage();
    const { loadEveningPhotos, rememberPhoto } = await import("@/lib/photo/evening");
    const now = 100 * 3600_000;
    for (let i = 0; i < 35; i++) rememberPhoto(`id${i}`, now + i * 60_000);
    const list = loadEveningPhotos();
    expect(list).toHaveLength(30);
    expect(list.at(-1)!.id).toBe("id34");
    store.set("ss_fotos_abend", JSON.stringify([{ id: "a", at: 1 }, { id: 2 }, "x"]));
    expect(loadEveningPhotos()).toEqual([{ id: "a", at: 1 }]);
    store.set("ss_fotos_abend", "kaputt");
    expect(loadEveningPhotos()).toEqual([]);
  });

  it("Setlist des Abends: ergänzen statt doppeln, ausgespielt, Tänze der letzten Songs, zurücksetzen", async () => {
    const { setlistStore, recentClipsKey, previousTheme } = await import("@/lib/stage/setlist");
    const s = setlistStore.getState();
    s.reset();
    s.record({ trackKey: "a", theme: "club", clips: ["x", "y"] });
    s.record({ trackKey: "a", mood: "energetisch" }); // ergänzt
    s.record({ trackKey: "b", theme: "jazz", clips: ["z"] });
    s.finish("b");
    s.finish("a"); // nicht der letzte → nichts
    const played = setlistStore.getState().played;
    expect(played).toHaveLength(2);
    expect(played[0]).toMatchObject({ trackKey: "a", theme: "club", mood: "energetisch" });
    expect(played[1]).toMatchObject({ trackKey: "b", finished: true });
    expect(recentClipsKey(played, "c")).toBe("x,y,z");
    expect(previousTheme(played, "c")).toBe("jazz");
    s.reset();
    expect(setlistStore.getState().played).toEqual([]);
  });

  it("Lichtbus: letzte Szene und Abonnenten", async () => {
    const { lightBus } = await import("@/lib/stage/light-bus");
    const seen: string[] = [];
    const off = lightBus.subscribe((f) => seen.push(f.scene));
    lightBus.publish({ scene: "refrain" } as never);
    off();
    lightBus.publish({ scene: "outro" } as never);
    expect(seen).toEqual(["refrain"]);
    expect(lightBus.latest()?.scene).toBe("outro");
  });
});

describe("Song-Gedächtnis je Konto", () => {
  it("Messungen zusammenführen und je Konto getrennt halten", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const { createMemoryStore } = await import("@/lib/server/memory-store");
    const { memoryCache } = await import("@/lib/lyrics/cache");
    const mem = createMemoryStore(memoryCache());
    expect(await mem.get("u1", "t")).toBeNull();
    await mem.add("u1", { trackKey: "t", drops: [30_000], bpm: 128 } as never);
    const second = await mem.add("u1", { trackKey: "t", drops: [30_400], bpm: 128 } as never);
    expect(second.drops).toHaveLength(1);
    expect(second.drops[0]!.seen).toBe(2);
    expect(await mem.get("u2", "t")).toBeNull();
  });
});

describe("Publikumsgeräusche abspielen", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("baut Klatscher, Jubel und Pfiffe im Audio-Graphen; ohne WebAudio still", async () => {
    vi.resetModules();
    const made: string[] = [];
    const param = () => ({
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    });
    const node = (kind: string) => {
      made.push(kind);
      const n = {
        gain: param(),
        frequency: param(),
        Q: param(),
        type: "",
        buffer: null,
        loop: false,
        connect: () => n,
        start: vi.fn(),
        stop: vi.fn(),
      };
      return n;
    };
    class FakeAudio {
      state = "suspended";
      currentTime = 0;
      sampleRate = 8000;
      destination = {};
      resume = vi.fn(async () => {});
      createBuffer = () => ({ getChannelData: () => new Float32Array(8000) });
      createGain = () => node("gain");
      createBiquadFilter = () => node("filter");
      createBufferSource = () => node("source");
      createOscillator = () => node("osc");
    }
    vi.stubGlobal("window", { AudioContext: FakeAudio });
    vi.stubGlobal("AudioContext", FakeAudio);
    const { playApplause, playEncoreClapping } = await import("@/lib/live/crowd-sound");
    playApplause(2);
    expect(made.filter((k) => k === "osc")).toHaveLength(3); // Pfiffe
    expect(made.filter((k) => k === "source").length).toBeGreaterThan(30); // Klatscher + Jubel
    const before = made.length;
    playEncoreClapping(1);
    expect(made.length).toBeGreaterThan(before);

    vi.resetModules();
    vi.stubGlobal("window", {});
    const quiet = await import("@/lib/live/crowd-sound");
    expect(() => quiet.playApplause(1)).not.toThrow();
  });
});
