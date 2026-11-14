import { describe, expect, it } from "vitest";
import { createLiveStore } from "@/lib/server/live-store";
import { memoryCache } from "@/lib/lyrics/cache";
import { buildSnapshot, commandSchema, snapshotSchema } from "@/lib/song-context/snapshot";
import { createSongContextStore } from "@/lib/song-context/store";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { settingsPatchFor } from "@/lib/live/commands";
import { planChoreography } from "@/lib/dance/plan";
import { lightsAt } from "@/lib/stage/lights";

describe("Song-Kontext-Schnappschuss", () => {
  it("enthält das Wesentliche und ist gültig", () => {
    const store = createSongContextStore();
    const s = store.getState();
    s.setSong(neonlicht);
    s.setFrozen(true);
    s.setPlayback({ positionMs: 68_500 });
    s.tick(0);
    const light = lightsAt(neonlicht, planChoreography(neonlicht, 124), 4, {
      t: 68_500,
      anchorMs: null,
      dropMs: null,
      energy: 0,
      micActive: false,
      strobeAllowed: true,
    });
    const snap = buildSnapshot(store.getState(), light)!;
    expect(() => snapshotSchema.parse(snap)).not.toThrow();
    expect(snap).toMatchObject({
      title: "Neonlicht",
      section: "verse",
      activeSinger: "Kai Vento",
      line: "wir drehen auf, wir geben Gas",
      light: { scene: "strophe" },
    });
    expect(snap.artists).toEqual([
      { name: "Mira Sol", role: "main" },
      { name: "Kai Vento", role: "feature" },
    ]);
  });

  it("ohne Song kein Schnappschuss", () => {
    expect(buildSnapshot(createSongContextStore().getState(), null)).toBeNull();
  });
});

describe("Live-Store", () => {
  it("speichert den Stand und liefert Befehle genau einmal aus", async () => {
    const live = createLiveStore(memoryCache());
    const snap = { trackKey: "t" } as never;
    await live.saveSnapshot("u1", snap);
    expect(await live.getSnapshot("u1")).toEqual(snap);
    expect(await live.getSnapshot("u2")).toBeNull();

    await live.pushCommand("u1", { type: "lampen", on: false });
    await live.pushCommand("u1", { type: "strobo", on: true });
    const cmds = await live.takeCommands("u1");
    expect(cmds.map((c) => c.type)).toEqual(["lampen", "strobo"]);
    expect(cmds[0]!.id).toMatch(/[0-9a-f-]{36}/);
    expect(await live.takeCommands("u1")).toEqual([]);
  });
});

describe("Befehle", () => {
  it("werden validiert und in Einstellungen übersetzt", () => {
    expect(commandSchema.safeParse({ type: "lampen", on: true }).success).toBe(true);
    expect(commandSchema.safeParse({ type: "rm -rf", on: true }).success).toBe(false);
    expect(settingsPatchFor({ type: "lampen", on: false })).toEqual({ lamps: false });
    expect(settingsPatchFor({ type: "strobo", on: true })).toEqual({ strobe: true });
    expect(settingsPatchFor({ type: "qualitaet", value: "niedrig" })).toEqual({ quality: "niedrig" });
    expect(settingsPatchFor({ type: "unbekannt" } as never)).toBeNull();
  });
});
