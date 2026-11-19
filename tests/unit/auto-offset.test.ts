import { describe, expect, it } from "vitest";
import {
  cueStarts,
  DEVICE_STEP_MS,
  estimate,
  matchOnset,
  SONG_SHIFT_MS,
  splitOffset,
  VocalOnsets,
} from "@/lib/lyrics/auto-offset";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { mergeObservation } from "@/lib/song-memory/memory";
import { diagnose } from "@/lib/debug/diagnose";

/** Stimmpegel wie ihn das Mikrofon liefert: Gesang ab `shift` nach dem Zeilenanfang, sonst leise; etwas Zufall */
function heardOnsets(shift: number, jitter = 80) {
  const lines = neonlicht.lyrics!.lines;
  const det = new VocalOnsets();
  const out: number[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let t = 0; t < 200_000; t += 20) {
    const singing = lines.some((l) => t >= l.startMs + shift && t < l.endMs + shift);
    const level = singing ? 0.7 : 0.05;
    if (det.push(level, t)) out.push(t + rand() * jitter);
  }
  return out;
}

function measure(shift: number, expected = 0) {
  const starts = cueStarts(neonlicht.lyrics!.lines);
  const diffs = heardOnsets(shift)
    .map((t) => matchOnset(t, starts, expected))
    .filter((d): d is number => d !== null);
  return estimate(diffs);
}

describe("Lyrics-Versatz automatisch", () => {
  it("misst die Verzögerung aus Gesangseinsätzen und Zeilenanfängen", () => {
    expect(measure(300)!.offsetMs).toBeGreaterThan(220);
    expect(measure(300)!.offsetMs).toBeLessThan(380);
    expect(Math.abs(measure(0)!.offsetMs)).toBeLessThan(80);
    expect(measure(-250)!.offsetMs).toBeLessThan(-170);
  });

  it("Einsätze nur nach einer Pause; Zeilen nur nach einer Lücke", () => {
    const d = new VocalOnsets();
    expect([0.05, 0.05].map((v, i) => d.push(v, i * 450))).toEqual([false, false]);
    expect(d.push(0.6, 700)).toBe(true);
    expect(d.push(0.6, 720)).toBe(false); // weitersingen ist kein neuer Einsatz
    expect(d.push(0.1, 740)).toBe(false);
    expect(d.push(0.6, 800)).toBe(false); // zu kurze Pause
    expect(
      cueStarts([
        { startMs: 0, endMs: 1000 },
        { startMs: 1200, endMs: 2000 },
        { startMs: 3000, endMs: 4000 },
      ]),
    ).toEqual([0, 3000]);
  });

  it("ohne genug übereinstimmende Messungen keine Schätzung", () => {
    expect(estimate([100, 120, 90])).toBeNull();
    expect(estimate([100, 900, -800, 1500, -1200, 50, 2000])).toBeNull();
  });

  it("kleine Abweichung: Lautsprecher langsam nachziehen; große: nur dieser Song; von Hand bleibt", () => {
    // 300 ms: Lautsprecher zieht höchstens einen Schritt nach
    expect(splitOffset(300, { manual: 0, device: 0 })).toEqual({ device: DEVICE_STEP_MS, song: 0 });
    // mit Handeinstellung: nur der Rest wird gelernt
    expect(splitOffset(300, { manual: 200, device: 0 })).toEqual({ device: 50, song: 0 });
    // Radio-Edit mit 3 s kürzerem Intro: nur dieser Song
    expect(splitOffset(-3000, { manual: 0, device: 150 })).toEqual({ device: 150, song: -3150 });
    expect(Math.abs(-3150)).toBeGreaterThan(SONG_SHIFT_MS);
  });

  it("Verschiebung des Songs im Song-Gedächtnis; Kurzdiagnose zeigt den Stand", () => {
    const a = mergeObservation(null, { drops: [], lyricsShiftMs: 2500 });
    expect(a.lyricsShiftMs).toBe(2500);
    expect(mergeObservation(a, { drops: [] }).lyricsShiftMs).toBe(2500);
    expect(mergeObservation(a, { drops: [], lyricsShiftMs: 0 }).lyricsShiftMs).toBe(0);
    const f = diagnose({
      song: neonlicht,
      offset: { manual: 100, device: 200, song: 0, measured: { n: 9, spreadMs: 60 } },
    } as Parameters<typeof diagnose>[0]).find((x) => x.label === "Lyrics-Versatz")!;
    expect(f.value).toContain("Lautsprecher +0,2 s");
    expect(f.value).toContain("9 Einsätzen");
  });
});
