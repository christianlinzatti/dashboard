import { describe, expect, it } from "vitest";
import { applauseSchedule, encoreSchedule } from "@/lib/live/crowd-sound";

describe("Publikumsgeräusche", () => {
  it("Applaus: viele Klatscher, schwillt an und klingt aus, alles innerhalb der Dauer", () => {
    const claps = applauseSchedule(6, 42);
    expect(claps.length).toBeGreaterThan(150);
    expect(claps.every((c) => c.at >= 0 && c.at < 6 && c.gain >= 0 && c.gain <= 1)).toBe(true);
    const count = (from: number, to: number) => claps.filter((c) => c.at >= from && c.at < to).length;
    expect(count(1.5, 2.5)).toBeGreaterThan(count(0, 1)); // anschwellen
    expect(count(1.5, 2.5)).toBeGreaterThan(count(5, 6)); // ausklingen
    expect(applauseSchedule(6, 42)).toEqual(claps); // deterministisch
  });
  it("Zugabe-Klatschen: im Takt (zwei pro Sekunde), wird lauter", () => {
    const claps = encoreSchedule(4);
    const beats = new Set(claps.map((c) => Math.round(c.at * 2)));
    expect(beats.size).toBe(8);
    const avg = (b: number) => {
      const xs = claps.filter((c) => Math.round(c.at * 2) === b);
      return xs.reduce((s, c) => s + c.gain, 0) / xs.length;
    };
    expect(avg(7)).toBeGreaterThan(avg(0));
  });
});
