import { describe, expect, it } from "vitest";
import { planChoreography } from "@/lib/dance/plan";
import { diagnose } from "@/lib/debug/diagnose";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { lastDropBefore, mergeObservation, observationSchema, trustedDrops } from "@/lib/song-memory/memory";

describe("Song-Gedächtnis", () => {
  it("fasst nahe Messungen zusammen und zählt Bestätigungen", () => {
    const a = mergeObservation(null, { drops: [60_000, 120_000], bpm: 128 });
    expect(a).toEqual({
      drops: [
        { ms: 60_000, seen: 1 },
        { ms: 120_000, seen: 1 },
      ],
      bpm: 128,
      plays: 1,
    });
    const b = mergeObservation(a, { drops: [60_400, 150_000] });
    expect(b.drops).toEqual([
      { ms: 60_200, seen: 2 },
      { ms: 120_000, seen: 1 },
      { ms: 150_000, seen: 1 },
    ]);
    expect(b.bpm).toBe(128);
    expect(b.plays).toBe(2);
  });

  it("vertraut nach einer Abspielung allen Drops, danach nur bestätigten", () => {
    expect(trustedDrops(mergeObservation(null, { drops: [1000, 9000] }))).toEqual([1000, 9000]);
    const twice = mergeObservation(mergeObservation(null, { drops: [1000, 9000] }), { drops: [1100] });
    expect(trustedDrops(twice)).toEqual([1050]);
    expect(trustedDrops(null)).toEqual([]);
  });

  it("bekannte Drops landen in der Choreografie und wirken wie gemessene", () => {
    const memory = mergeObservation(null, { drops: [61_000], bpm: 124 });
    const c = planChoreography({ ...neonlicht, memory }, 124);
    expect(c.knownDrops).toEqual([61_000]);
    expect(lastDropBefore(c.knownDrops!, 60_000)).toBeNull();
    expect(lastDropBefore(c.knownDrops!, 62_000)).toBe(61_000);
    expect(planChoreography(neonlicht, 124).knownDrops).toEqual([]);
  });

  it("Meldung des Kiosks wird geprüft; Kurzdiagnose zeigt den Stand", () => {
    expect(observationSchema.safeParse({ trackKey: "t", drops: [1, 2], bpm: 128 }).success).toBe(true);
    expect(observationSchema.safeParse({ trackKey: "t", drops: [-1] }).success).toBe(false);
    expect(observationSchema.safeParse({ trackKey: "", drops: [] }).success).toBe(false);
    const memory = mergeObservation(null, { drops: [61_000], bpm: 124 });
    const f = diagnose({ song: { ...neonlicht, memory } } as Parameters<typeof diagnose>[0]).find(
      (x) => x.label === "Song-Gedächtnis",
    )!;
    expect(f.value).toContain("1 Drops bekannt");
    expect(
      diagnose({ song: neonlicht } as Parameters<typeof diagnose>[0]).find((x) => x.label === "Song-Gedächtnis")!.value,
    ).toContain("noch nichts gemessen");
  });
});
