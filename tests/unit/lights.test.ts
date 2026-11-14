import { describe, expect, it } from "vitest";
import { planChoreography } from "@/lib/dance/plan";
import { lightsAt, type LightInput } from "@/lib/stage/lights";
import { PRESETS, stepQuality } from "@/lib/stage/quality";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";

const plan = planChoreography(neonlicht, 124);
const base: LightInput = { t: 0, anchorMs: null, dropMs: null, energy: 0, micActive: false, strobeAllowed: true };
const at = (t: number, extra: Partial<LightInput> = {}) => lightsAt(neonlicht, plan, 6, { ...base, t, ...extra });

describe("LightDirector", () => {
  it("Szene folgt dem Abschnitt", () => {
    expect(at(3000).scene).toBe("intro");
    expect(at(20_000).scene).toBe("strophe");
    expect(at(46_000).scene).toBe("refrain");
    expect(at(112_000).scene).toBe("bridge");
    expect(at(180_000).scene).toBe("outro");
  });

  it("Refrain: alle Köpfe an, Laser an; Intro: nur die Mitte, keine Laser", () => {
    const chorus = at(46_000);
    expect(chorus.heads.every((h) => h.intensity > 0)).toBe(true);
    expect(chorus.lasers.on).toBe(true);
    const intro = at(3000);
    expect(intro.heads.filter((h) => h.intensity > 0).length).toBeLessThanOrEqual(2);
    expect(intro.lasers.on).toBe(false);
  });

  it("deterministisch und bewegt sich mit der Zeit", () => {
    expect(at(46_000)).toEqual(at(46_000));
    expect(at(46_500).heads[0]!.pan).not.toBeCloseTo(at(46_000).heads[0]!.pan, 3);
  });

  it("Farbwechsel auf Taktanfang", () => {
    const bar = plan.barMs;
    const start = Math.ceil(44_000 / bar) * bar; // Taktanfang im Raster (ohne Mikro ab Songbeginn)
    expect(at(start + 0.1 * bar).heads[0]!.color).toBe(at(start + 0.9 * bar).heads[0]!.color);
    expect(at(start + 1.1 * bar).heads[0]!.color).not.toBe(at(start + 0.9 * bar).heads[0]!.color);
  });

  it("Drop: Strobe nur kurz nach dem Schlag und nur wenn erlaubt", () => {
    const drop = 60_000;
    const onBeat = at(drop + plan.beatMs * 4 + 10, { dropMs: drop, anchorMs: drop, micActive: true, energy: 0.9 });
    expect(onBeat.scene).toBe("drop");
    expect(onBeat.strobe).toBeGreaterThan(0.8);
    expect(at(drop + plan.beatMs * 4.5, { dropMs: drop, anchorMs: drop, micActive: true, energy: 0.9 }).strobe).toBe(0);
    expect(at(drop + plan.beatMs * 4 + 10, { dropMs: drop, anchorMs: drop, micActive: true, energy: 0.9, strobeAllowed: false }).strobe).toBe(0);
    // nach zwei Takten vorbei
    expect(at(drop + plan.barMs * 2 + 50, { dropMs: drop, anchorMs: drop }).scene).not.toBe("drop");
  });

  it("Bridge in Sängerfarbe; Lichtsignal für externe Lampen gültig", () => {
    const f = at(112_000, { singerColor: "#3ee6ff" });
    expect(f.heads.find((h) => h.intensity > 0)!.color).toBe("#3ee6ff");
    expect(f.signal.brightness).toBeGreaterThan(0);
    expect(f.signal.pulse).toBeGreaterThanOrEqual(0);
    expect(f.signal.pulse).toBeLessThanOrEqual(1);
  });
});

describe("Qualitätsstufen", () => {
  it("mehr Qualität = mehr Effekte; Stufen begrenzt", () => {
    expect(PRESETS.niedrig.heads).toBeLessThan(PRESETS.hoch.heads);
    expect(PRESETS.niedrig.bloom).toBe(false);
    expect(stepQuality("niedrig", -1)).toBe("niedrig");
    expect(stepQuality("mittel", 1)).toBe("hoch");
  });
});
