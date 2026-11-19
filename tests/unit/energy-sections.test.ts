import { describe, expect, it } from "vitest";
import { ENERGY_BIN_MS, mergeEnergy, sectionsFromEnergy } from "@/lib/song-memory/energy-sections";
import { mergeObservation } from "@/lib/song-memory/memory";
import { planChoreography } from "@/lib/dance/plan";
import { instrumental } from "@/lib/song-context/fixtures/instrumental";

const BAR = 2000; // 120 BPM
const BLOCK = 8 * BAR;

/** Energieverlauf aus Blöcken zu je 8 Takten (Werte 0..100) mit etwas Schwankung */
function curve(levels: number[]) {
  const out: number[] = [];
  const perBlock = BLOCK / ENERGY_BIN_MS;
  levels.forEach((l, b) => {
    for (let i = 0; i < perBlock; i++) out.push(Math.max(0, Math.min(100, l + ((b * 7 + i * 13) % 9) - 4)));
  });
  return out;
}

describe("Abschnitte aus dem Energieverlauf", () => {
  it("Techno-Track: Intro, Aufbau, Drop, Breakdown, Aufbau, Drop, Outro", () => {
    const levels = [15, 20, 50, 90, 92, 20, 55, 95, 90, 15];
    const s = sectionsFromEnergy(curve(levels), levels.length * BLOCK, BAR)!;
    expect(s.map((x) => x.kind)).toEqual(["intro", "prechorus", "chorus", "bridge", "prechorus", "chorus", "outro"]);
    // Grenzen auf dem 8-Takt-Raster, lückenlos bis zum Ende
    expect(s[0]!.startMs).toBe(0);
    for (let i = 1; i < s.length; i++) expect(s[i]!.startMs).toBe(s[i - 1]!.endMs);
    expect(s.at(-1)!.endMs).toBe(levels.length * BLOCK);
    expect(s.every((x) => x.startMs % BLOCK === 0)).toBe(true);
  });

  it("gleichförmig, zu kurz oder kaum gemessen: keine Abschnitte (Schätzung bleibt)", () => {
    expect(sectionsFromEnergy(curve([50, 52, 51, 50, 49, 50]), 6 * BLOCK, BAR)).toBeNull();
    expect(sectionsFromEnergy(curve([10, 90]), 2 * BLOCK, BAR)).toBeNull();
    expect(sectionsFromEnergy(curve([10, 90, 10]), 10 * BLOCK, BAR)).toBeNull();
  });

  it("Messungen mehrerer Abspielungen werden gemittelt", () => {
    expect(mergeEnergy([10, 20, 30], 1, [30, 40, 50])).toEqual([20, 30, 40]);
    expect(mergeEnergy([10, 20, 30], 3, [50, 60, 70])).toEqual([20, 30, 40]);
    // andere Länge (andere Version): ersetzt
    expect(mergeEnergy([10, 20], 1, [30, 40, 50, 60, 70])).toEqual([30, 40, 50, 60, 70]);
    expect(mergeEnergy(undefined, 0, [1.4, 2.6])).toEqual([1, 3]);
  });

  it("Song-Gedächtnis mittelt den Verlauf; die Choreografie nutzt ihn bei Songs ohne Lyrics", () => {
    const a = mergeObservation(null, { drops: [], energy: [10, 20] });
    expect(a).toMatchObject({ energy: [10, 20], energySeen: 1 });
    expect(mergeObservation(a, { drops: [], energy: [30, 40] })).toMatchObject({ energy: [20, 30], energySeen: 2 });
    expect(mergeObservation(a, { drops: [1000] })).toMatchObject({ energy: [10, 20], energySeen: 1 });

    // Instrumental (240 s, 132 BPM): ohne Gedächtnis geschätzt, mit Energieverlauf echte Drops und Breakdowns
    const bar = (60_000 / 132) * 4;
    const blocks = Math.ceil(instrumental.track.durationMs / (8 * bar));
    const levels = Array.from({ length: blocks }, (_, b) =>
      b < 2 ? 15 : b >= blocks - 2 ? 12 : b % 4 === 1 ? 50 : b % 4 === 2 || b % 4 === 3 ? 92 : 20,
    );
    const energy: number[] = [];
    for (let t = 0; t < instrumental.track.durationMs; t += ENERGY_BIN_MS)
      energy.push(levels[Math.min(blocks - 1, Math.floor(t / (8 * bar)))]!);
    const memory = mergeObservation(null, { drops: [], energy });
    const plain = planChoreography(instrumental, 132);
    const known = planChoreography({ ...instrumental, memory }, 132);
    const kinds = (c: typeof plain) => [...new Set(c.phrases.map((p) => p.section))];
    expect(kinds(plain)).not.toContain("chorus");
    expect(kinds(known)).toEqual(expect.arrayContaining(["intro", "chorus", "outro"]));
    expect(known.climaxes.length).toBeGreaterThan(0);
  });
});
