import { describe, expect, it } from "vitest";
import { bandPowers, smooth, spectralFlux } from "@/lib/audio/features";
import { estimateTempo } from "@/lib/audio/tempo";
import { BeatTracker } from "@/lib/audio/beat-tracker";
import { DropDetector, EnergyMeter } from "@/lib/audio/dynamics";

const FR = 100;

/** Synthetische Onset-Hüllkurve: Kicks im Tempo, leichte Offbeats, Rauschen, Timing-Jitter. */
function clicks(bpm: number, seconds: number, opts: { phaseSec?: number; jitter?: number; noise?: number; seed?: number } = {}) {
  let s = opts.seed ?? 7;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const env = new Float32Array(Math.round(seconds * FR));
  const period = 60 / bpm;
  for (let t = opts.phaseSec ?? 0; t < seconds; t += period) {
    const i = Math.round((t + (rand() - 0.5) * (opts.jitter ?? 0)) * FR);
    if (i >= 0 && i < env.length) env[i] = 1;
    const off = Math.round((t + period / 2) * FR);
    if (off < env.length) env[off]! += 0.3; // Hi-Hat auf dem Offbeat
  }
  for (let i = 0; i < env.length; i++) env[i]! += rand() * (opts.noise ?? 0.05);
  return env;
}

describe("Tempo-Schätzung", () => {
  it.each([90, 100, 120, 128, 140, 150])("erkennt %d BPM (±1,5)", (bpm) => {
    const est = estimateTempo(clicks(bpm, 8, { jitter: 0.01 }), FR)!;
    expect(est.bpm).toBeGreaterThan(bpm - 1.5);
    expect(est.bpm).toBeLessThan(bpm + 1.5);
    expect(est.confidence).toBeGreaterThan(0.2);
  });

  it("sehr schnelle Songs (Drum & Bass, 174) dürfen als Halbtempo erkannt werden", () => {
    const est = estimateTempo(clicks(174, 8, { jitter: 0.01 }), FR)!;
    const ok = [174, 87].some((b) => Math.abs(est.bpm - b) < 1.5);
    expect(ok).toBe(true);
    expect(est.confidence).toBeGreaterThan(0.2);
  });

  it("findet die Phase des letzten Schlags", () => {
    // 120 BPM, Schläge bei 0,1 s + k·0,5 s; Hüllkurve endet bei 8,0 s → letzter Schlag 7,6 s → 40 Frames vorher
    const est = estimateTempo(clicks(120, 8, { phaseSec: 0.1 }), FR)!;
    expect(Math.abs(est.framesSinceBeat - 39)).toBeLessThanOrEqual(2);
  });

  it("Rauschen ohne Puls hat geringe Sicherheit, Stille gar kein Ergebnis", () => {
    let s = 3;
    const noise = Float32Array.from({ length: 800 }, () => (s = (s * 16807) % 2147483647) / 2147483647);
    expect(estimateTempo(noise, FR)!.confidence).toBeLessThan(0.2);
    expect(estimateTempo(new Float32Array(800), FR)).toBeNull();
    expect(estimateTempo(new Float32Array(100), FR)).toBeNull();
  });
});

describe("Beat-Tracker", () => {
  it("rastet auf Tempo und Phase ein und meldet Schläge im Takt", () => {
    const bpm = 125;
    const env = clicks(bpm, 20, { phaseSec: 0.23, jitter: 0.012, noise: 0.08 });
    const tracker = new BeatTracker(FR);
    const beats: number[] = [];
    env.forEach((v, i) => tracker.push(v, i / FR) && beats.push(i / FR));
    const st = tracker.state(20);
    expect(st.bpm).toBeGreaterThan(bpm - 2);
    expect(st.bpm).toBeLessThan(bpm + 2);
    // Schläge der letzten 6 s liegen nah am echten Raster
    const period = 60 / bpm;
    const late = beats.filter((t) => t > 14);
    expect(late.length).toBeGreaterThan(10);
    for (const t of late) {
      const err = (((t - 0.23) % period) + period) % period;
      expect(Math.min(err, period - err)).toBeLessThan(0.06);
    }
  });

  it("passt sich einem Tempowechsel an", () => {
    const tracker = new BeatTracker(FR);
    const a = clicks(100, 15);
    const b = clicks(140, 15, { seed: 11 });
    [...a, ...b].forEach((v, i) => tracker.push(v, i / FR));
    expect(Math.abs(tracker.state(30).bpm - 140)).toBeLessThan(3);
  });
});

describe("Energie & Drops", () => {
  it("Energie ist relativ zum Pegel (lauter Song und leiser Song ähnlich)", () => {
    const run = (base: number) => {
      const m = new EnergyMeter();
      let r = { energy: 0, longEnergy: 0 };
      for (let i = 0; i < 1500; i++) r = m.push(base + (i % 50 < 25 ? 0 : -15), 0.01);
      return r.longEnergy;
    };
    expect(Math.abs(run(-20) - run(-45))).toBeLessThan(0.05);
  });

  it("erkennt einen Drop nach einem Break, aber nicht im gleichmäßigen Teil", () => {
    const d = new DropDetector();
    const m = new EnergyMeter();
    const drops: number[] = [];
    const dt = 0.01;
    // 20 s laut, 6 s Break (leise, kein Bass), dann Drop
    for (let i = 0; i < 3500; i++) {
      const t = i * dt;
      const inBreak = t >= 20 && t < 26;
      const db = inBreak ? -38 : -15 + (i % 50 < 10 ? 3 : 0);
      const { energy, longEnergy } = m.push(db, dt);
      if (d.push(energy, longEnergy, inBreak ? 0.05 : 0.6, t, dt)) drops.push(t);
    }
    expect(drops).toHaveLength(1);
    expect(drops[0]!).toBeGreaterThan(26);
    expect(drops[0]!).toBeLessThan(27.5);
  });
});

describe("Spektrum", () => {
  it("Bandleistungen und Flux", () => {
    const sr = 48_000;
    const fft = 2048;
    const db = new Float32Array(fft / 2).fill(-100);
    const bin = (hz: number) => Math.round(hz / (sr / fft));
    db[bin(100)] = -10; // Bass
    const p = bandPowers(db, sr, fft);
    expect(p[1]).toBeGreaterThan(p[3]! * 100);

    const prev = new Float32Array(fft / 2).fill(-100);
    expect(spectralFlux(db, prev, sr, fft)).toBeGreaterThan(0);
    expect(spectralFlux(db, prev, sr, fft)).toBe(0); // gleiches Spektrum → kein Onset
  });

  it("Glättung nähert sich dem Ziel", () => {
    let v = 0;
    for (let i = 0; i < 100; i++) v = smooth(v, 1, 0.01, 0.1);
    expect(v).toBeGreaterThan(0.99);
  });
});

import { beatStride, TempoLock, updateAnchor } from "@/lib/audio/lock";
import { layersAt } from "@/lib/dance/evaluate";
import { planChoreography } from "@/lib/dance/plan";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";

describe("Tempo-Einrasten", () => {
  it("rastet erst nach stabiler Messung ein und reagiert nicht auf Ausreißer", () => {
    const lock = new TempoLock();
    let got: number | null = null;
    for (let i = 0; i < 300; i++) got ??= lock.push(i === 150 ? 90 : 124 + (i % 3) * 0.3, 0.6, 0.01);
    expect(got).toBeNull(); // 3 s reichen nicht (Ausreißer setzt zurück)
    for (let i = 0; i < 500; i++) got ??= lock.push(124.2, 0.6, 0.01);
    expect(got).toBe(124);
  });

  it("ignoriert unsichere Messungen und rastet nur bei anhaltender Abweichung neu ein", () => {
    const lock = new TempoLock();
    for (let i = 0; i < 500; i++) lock.push(120, 0.9, 0.01);
    expect(lock.locked).toBe(120);
    for (let i = 0; i < 2000; i++) lock.push(60, 0.1, 0.01);
    expect(lock.locked).toBe(120);
    let re: number | null = null;
    for (let i = 0; i < 900; i++) re ??= lock.push(140, 0.9, 0.01);
    expect(re).toBe(140);
  });
});

describe("Beat-Raster", () => {
  it("Anker folgt sanft und springt nie um einen ganzen Schlag", () => {
    let a = updateAnchor(null, 10_000, 500);
    expect(a).toBe(10_000);
    a = updateAnchor(a, 10_520, 500); // 20 ms später als erwartet
    expect(a).toBeCloseTo(10_006);
    a = updateAnchor(a, 30_490, 500); // weit entfernt, aber nur −16 ms Phasenfehler
    expect(Math.abs(a - 10_006)).toBeLessThan(10);
    expect(beatStride(1000, 500)).toBe(2);
    expect(beatStride(500, 500)).toBe(1);
  });

  it("Tanz-Clips laufen mit Mikro am Raster ausgerichtet", () => {
    const plan = planChoreography(neonlicht, 120);
    const lead = plan.order[0]!;
    // Am Anker (und jedem Vielfachen eines Schlags danach) steht der Clip auf einem Schlag (Vielfaches von 0,5 s)
    for (const t of [40_123, 40_123 + 500, 40_123 + 7 * 500]) {
      const l = layersAt(plan, lead, t, { anchorMs: 40_123 }).at(-1)!;
      expect((l.time * 2) % 1).toBeCloseTo(0, 5);
    }
  });

  it("Drop: zwei Takte Höhepunkt-Clip mit Ein- und Ausblendung", () => {
    const plan = planChoreography(neonlicht, 120);
    const lead = plan.order[0]!;
    const drop = 70_000;
    const during = layersAt(plan, lead, drop + plan.barMs, { dropMs: drop });
    const peak = during.find((l) => l.clip === "Dance_FestivalBounce" || l.clip === "Dance_PowerHit");
    expect(peak?.weight).toBeCloseTo(1);
    // Danach wieder der normale Plan
    const t = drop + 3 * plan.barMs;
    expect(layersAt(plan, lead, t, { dropMs: drop })).toEqual(layersAt(plan, lead, t));
  });
});
