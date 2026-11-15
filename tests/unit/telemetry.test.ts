import { describe, expect, it, vi } from "vitest";
import { createTelemetry } from "@/lib/live/telemetry";
import { logBatchSchema } from "@/lib/live/log-schema";
import { createLogStore } from "@/lib/server/log-store";
import { memoryCache } from "@/lib/lyrics/cache";
import { fpsFrom } from "@/lib/stage/perf";

describe("Kiosk-Protokoll", () => {
  it("fasst gleiche Meldungen innerhalb einer Minute zusammen und sendet gebündelt", async () => {
    let t = 0;
    const sent: unknown[][] = [];
    const tel = createTelemetry({ send: async (e) => void sent.push(e), now: () => t });
    tel.report("fehler", "js", "x is undefined");
    tel.report("fehler", "js", "x   is undefined"); // gleiche Meldung (Leerzeichen normalisiert)
    tel.report("warnung", "3D-Bühne", "Avatar fehlt");
    expect(tel.pending()).toBe(2);
    await tel.flush();
    expect(sent[0]).toEqual([
      { level: "fehler", source: "js", message: "x is undefined", count: 2, at: 0 },
      { level: "warnung", source: "3D-Bühne", message: "Avatar fehlt", count: 1, at: 0 },
    ]);
    expect(() => logBatchSchema.parse({ entries: sent[0] })).not.toThrow();
    t = 30_000;
    tel.report("fehler", "js", "x is undefined"); // noch in der Minute → Zähler, erneut senden
    await tel.flush();
    expect(sent[1]).toEqual([expect.objectContaining({ count: 3 })]);
    t = 120_000;
    tel.report("fehler", "js", "x is undefined"); // neue Minute → neuer Eintrag
    await tel.flush();
    expect(sent[2]).toEqual([expect.objectContaining({ count: 1, at: 120_000 })]);
    await tel.flush(); // leer → nichts senden
    expect(sent).toHaveLength(3);
  });

  it("höchstens 20 Einträge pro Versand, lange Texte gekürzt, Sendefehler werden geschluckt", async () => {
    const send = vi.fn(async () => {
      throw new Error("offline");
    });
    const tel = createTelemetry({ send });
    for (let i = 0; i < 25; i++) tel.report("info", "x", `m${i}`);
    tel.report("info", "x", "y".repeat(900));
    await expect(tel.flush()).resolves.toBeUndefined();
    expect((send.mock.calls[0] as unknown as [unknown[]])[0]).toHaveLength(20);
    expect(tel.pending()).toBe(6);
  });

  it("Server hält die letzten 100 Einträge", async () => {
    const store = createLogStore(memoryCache());
    const e = (n: number) => ({ level: "info" as const, source: "t", message: `m${n}`, count: 1, at: n });
    await store.append(
      "u1",
      Array.from({ length: 80 }, (_, i) => e(i)),
    );
    await store.append(
      "u1",
      Array.from({ length: 40 }, (_, i) => e(80 + i)),
    );
    const list = await store.list("u1");
    expect(list).toHaveLength(100);
    expect(list[0]!.message).toBe("m20");
    expect(await store.list("u2")).toEqual([]);
  });
});

describe("Bildrate", () => {
  it("Mittel der Frame-Zeiten ohne die 5 % langsamsten (Hänger)", () => {
    expect(fpsFrom(Array(60).fill(1 / 60))).toBe(60);
    expect(fpsFrom([...Array(57).fill(1 / 30), 0.5, 0.5, 0.5])).toBe(30);
    expect(fpsFrom([0.016])).toBeNull();
  });
});

describe("Leerlauf-Helligkeit", () => {
  it("10 min gedimmt, 60 min fast aus", async () => {
    const { idleBrightness } = await import("@/lib/live/idle-dim");
    expect([0, 9 * 60_000, 10 * 60_000, 59 * 60_000, 60 * 60_000].map(idleBrightness)).toEqual([1, 1, 0.35, 0.35, 0.12]);
  });
});

describe("Avatar-Adressen", () => {
  it("tragen eine Version aus der Prüfsumme (Cache ist ein Jahr gültig)", async () => {
    const { avatars } = await import("@/lib/avatars/catalog");
    expect(avatars.length).toBeGreaterThan(5);
    for (const a of avatars) expect(a.url).toMatch(new RegExp(`^/avatars/${a.id}\\.glb\\?v=[0-9a-f]{12}$`));
  });
});
