import { describe, expect, it } from "vitest";
import { rng } from "@/lib/dance/rng";
import { DrumDetector, type DrumKind } from "@/lib/audio/drums";

const SR = 48_000;
const FFT = 2048;
const BIN = SR / FFT;
const DT = 0.01;

/** Synthetisches Spektrum: Grundrauschen, dazu abklingende Schläge in ihren Frequenzbereichen */
function simulate(pattern: Array<{ at: number; kind: DrumKind }>, seconds: number) {
  const r = rng("drums");
  const ranges: Record<DrumKind, Array<[number, number]>> = {
    kick: [[45, 110]],
    snare: [
      [170, 300],
      [2200, 4800],
    ],
    hat: [[7500, 13000]],
  };
  const det = new DrumDetector();
  const hits: Array<{ t: number; kind: DrumKind }> = [];
  const db = new Float32Array(FFT / 2);
  for (let f = 0; f * DT < seconds; f++) {
    const t = f * DT;
    for (let i = 0; i < db.length; i++) db[i] = -80 + r.next() * 3;
    for (const p of pattern) {
      const age = t - p.at;
      if (age < 0 || age > 0.15) continue;
      const level = 45 * Math.exp(-age / 0.04);
      for (const [lo, hi] of ranges[p.kind])
        for (let i = Math.floor(lo / BIN); i <= Math.ceil(hi / BIN); i++) db[i] = db[i]! + level;
    }
    const o = det.push(db, SR, FFT, t, DT);
    for (const k of ["kick", "snare", "hat"] as const) if (o[k]) hits.push({ t, kind: k });
  }
  return hits;
}

describe("Schlagzeug aus dem Mikrofon", () => {
  it("trennt Bassdrum, Snare und Hi-Hat und trifft den Zeitpunkt", () => {
    // 120 BPM, zwei Takte: Bassdrum auf 1 und 3, Snare auf 2 und 4, Hi-Hat in Achteln
    const pattern: Array<{ at: number; kind: DrumKind }> = [];
    for (let beat = 0; beat < 8; beat++) {
      const at = 1 + beat * 0.5;
      pattern.push({ at, kind: beat % 2 === 0 ? "kick" : "snare" });
      pattern.push({ at: at + 0.25, kind: "hat" });
    }
    const hits = simulate(pattern, 5.5);
    for (const kind of ["kick", "snare", "hat"] as const) {
      const want = pattern.filter((p) => p.kind === kind).map((p) => p.at);
      const got = hits.filter((h) => h.kind === kind).map((h) => h.t);
      expect(got).toHaveLength(want.length);
      got.forEach((t, i) => expect(Math.abs(t - want[i]!)).toBeLessThan(0.025));
    }
  });

  it("Rauschen allein löst nichts aus; ein Schlag gibt genau einen Treffer", () => {
    expect(simulate([], 4)).toEqual([]);
    expect(simulate([{ at: 2, kind: "kick" }], 4).map((h) => h.kind)).toEqual(["kick"]);
  });
});
