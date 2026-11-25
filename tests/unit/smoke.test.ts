import { describe, expect, it } from "vitest";
import { planChoreography } from "@/lib/dance/plan";
import { fixtures } from "@/lib/song-context/fixtures";
import { BURST_MS, GROUND_FOG, PUFF_LIFE_MS, SMOKE_COUNTS, activeBursts, groundFogLevel, planSmoke } from "@/lib/stage/smoke";

const c = planChoreography(fixtures.neonlicht!, 124);

describe("Bühnennebel", () => {
  it("Bodennebel: dicht in ruhigen Teilen und im Aufbau, dünn im Refrain und Drop; Balladen bleiben neblig", () => {
    expect(GROUND_FOG.intro).toBeGreaterThan(GROUND_FOG.refrain);
    expect(GROUND_FOG.aufbau).toBeGreaterThan(GROUND_FOG.strophe);
    expect(GROUND_FOG.drop).toBeLessThan(0.3);
    expect(groundFogLevel("refrain", false)).toBe(GROUND_FOG.refrain);
    expect(groundFogLevel("refrain", true)).toBeGreaterThanOrEqual(0.6);
    expect(groundFogLevel("intro", true)).toBe(GROUND_FOG.intro);
  });

  it("Nebelmaschinen: ein Stoß je Abschnittswechsel, ruhige Abschnitte dichter", () => {
    const bursts = planSmoke(c);
    const starts = c.phrases.filter((p, i) => i === 0 || c.phrases[i - 1]!.section !== p.section);
    expect(bursts.map((b) => b.atMs)).toEqual(starts.map((p) => p.startMs));
    expect(bursts[0]!.strength).toBe(1); // Intro
    expect(Math.min(...bursts.map((b) => b.strength))).toBeLessThan(1);
  });

  it("höchstens die beiden jüngsten Stöße schweben, mit ihrem Alter", () => {
    const bursts = [
      { atMs: 0, strength: 1 },
      { atMs: 4000, strength: 0.65 },
      { atMs: 8000, strength: 1 },
    ];
    expect(activeBursts(bursts, -1)).toEqual([]);
    expect(activeBursts(bursts, 9000)).toEqual([
      { ageMs: 5000, strength: 0.65 },
      { ageMs: 1000, strength: 1 },
    ]);
    expect(activeBursts(bursts, 8000 + BURST_MS + PUFF_LIFE_MS)).toEqual([]);
  });

  it("auf „niedrig“ kein Nebel, auf „mittel“ wenige große Teilchen", () => {
    expect(SMOKE_COUNTS.niedrig.ground + SMOKE_COUNTS.niedrig.burst).toBe(0);
    expect(SMOKE_COUNTS.mittel.ground + SMOKE_COUNTS.mittel.burst).toBeLessThanOrEqual(40);
    expect(SMOKE_COUNTS.hoch.ground).toBeGreaterThan(SMOKE_COUNTS.mittel.ground);
  });
});
