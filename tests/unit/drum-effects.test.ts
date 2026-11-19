import { describe, expect, it } from "vitest";
import { planChoreography } from "@/lib/dance/plan";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { snareFlame, SNARE_FLAME_BARS } from "@/lib/stage/effects";
import { lightsAt } from "@/lib/stage/lights";
import { THEMES } from "@/lib/stage/themes";

const c = planChoreography(neonlicht, 124);
const chorus = c.phrases.find((p) => p.section === "chorus")!;
const calm = c.phrases.find((p) => p.section !== "chorus" && p.energy < 3)!;
const flames = Object.values(THEMES).find((t) => t.effects.includes("flammen"))!;
const noFlames = Object.values(THEMES).find((t) => !t.effects.includes("flammen"))!;

describe("Schlagzeug steuert Effekte (Mikrofon)", () => {
  it("Snare zündet im Refrain einen kurzen Flammenstoß, höchstens einen je Takt", () => {
    const t = chorus.startMs + 1000;
    const q = snareFlame(c, flames, t, null)!;
    expect(q).toMatchObject({ kind: "flammen", startMs: t });
    expect(q.durationMs).toBeLessThanOrEqual(450);
    expect(snareFlame(c, flames, t + c.beatMs, t)).toBeNull();
    expect(snareFlame(c, flames, t + SNARE_FLAME_BARS * c.barMs, t)).not.toBeNull();
    // ruhige Teile, Bühnen ohne Flammenwerfer, keine Snare: nichts
    expect(snareFlame(c, flames, calm.startMs + 1000, null)).toBeNull();
    expect(snareFlame(c, noFlames, t, null)).toBeNull();
    expect(snareFlame(c, flames, null, null)).toBeNull();
  });

  it("Hi-Hat lässt die Laser aufblitzen (nur mit Mikrofon)", () => {
    const t = chorus.startMs + 4000;
    const base = { t, anchorMs: null, dropMs: null, energy: 0.9, micActive: true, strobeAllowed: true };
    const right = lightsAt(neonlicht, c, 8, { ...base, hatMs: t - 5 }).lasers;
    const later = lightsAt(neonlicht, c, 8, { ...base, hatMs: t - 300 }).lasers;
    expect(right.on).toBe(true);
    expect(right.intensity).toBeGreaterThan(later.intensity * 2);
    expect(right.spread).toBeGreaterThan(later.spread);
    // ohne Mikrofon: wie bisher, unabhängig von der Hi-Hat
    const off = { ...base, micActive: false, energy: 0 };
    expect(lightsAt(neonlicht, c, 8, { ...off, hatMs: t - 5 }).lasers).toEqual(lightsAt(neonlicht, c, 8, off).lasers);
  });
});
