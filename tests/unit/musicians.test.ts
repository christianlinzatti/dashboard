import { describe, expect, it } from "vitest";
import { planChoreography } from "@/lib/dance/plan";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { deckAngle, drumHits, headNodAt, keysAt, scratchAt } from "@/lib/stage/musicians";

const c = planChoreography(neonlicht, 124);
const beat = c.beatMs;
const chorus = c.phrases.find((p) => p.section === "chorus")!;
const verse = c.phrases.find((p) => p.section === "verse" && p.energy >= 1)!;
/** Zeitpunkt kurz nach dem n-ten Schlag einer Phrase (Raster ab Songbeginn) */
const at = (startMs: number, n: number, after = 5) => Math.ceil(startMs / beat) * beat + n * beat + after;

describe("Band spielt im Takt", () => {
  it("Schlagzeug: Snare auf 2 und 4, Becken auf der Eins der Phrase, Treffer klingen ab", () => {
    const bar = Math.ceil(verse.startMs / c.barMs) * c.barMs;
    const beats = [0, 1, 2, 3].map((n) => drumHits(c, bar + n * beat + 5));
    expect(beats.map((h) => h.snare > 0.5)).toEqual([false, true, false, true]);
    expect(beats.every((h) => h.hat > 0)).toBe(true);
    // abklingend: kurz nach dem Schlag stark, eine halbe Schlaglänge später schwach
    expect(drumHits(c, bar + beat + 5).snare).toBeGreaterThan(drumHits(c, bar + beat + beat / 2).snare);
    const first = drumHits(c, chorus.startMs + 5);
    expect(first.crash).toBeGreaterThan(0.9);
    // gleiche Zeit, gleiches Ergebnis (Screenshots, angehaltene Demos)
    expect(drumHits(c, 61_234)).toEqual(drumHits(c, 61_234));
  });

  it("DJ: Plattenteller drehen mit 33⅓, im Refrain wird gescratcht", () => {
    expect(deckAngle(60_000 / 33.333)).toBeCloseTo(0, 1);
    expect(deckAngle(450)).toBeGreaterThan(0);
    expect(scratchAt(c, at(verse.startMs, 1, beat / 4))).toBe(verse.energy >= 3 ? expect.any(Number) : 0);
    expect(Math.abs(scratchAt(c, at(chorus.startMs, 1, beat / 4)))).toBeGreaterThan(0.9);
  });

  it("Keyboard: zwei Tastengruppen je Takt, Anschlag auf dem Schlag", () => {
    const k = keysAt(c, at(chorus.startMs, 0));
    expect(k.zones.filter(Boolean)).toHaveLength(2);
    expect(k.press).toBeGreaterThan(0.9);
    expect(keysAt(c, at(chorus.startMs, 0, beat * 0.9)).press).toBeLessThan(k.press);
  });

  it("Kopfnicken im Takt, Rock-Refrain: Headbangen", () => {
    const mid = at(chorus.startMs, 2, beat / 2);
    expect(headNodAt(c, mid, null, true)).toBeGreaterThan(headNodAt(c, mid, null, false));
    expect(headNodAt(c, mid, null, true)).toBeGreaterThan(0.3);
  });
});
