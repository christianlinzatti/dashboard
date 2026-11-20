import { describe, expect, it } from "vitest";
import {
  hudClearance,
  HUD_TOP_NDC,
  MAX_SIGN_CHARS,
  SIGN_FADE_IN_MS,
  SIGN_FADE_OUT_MS,
  signAt,
  signWords,
  WORD_POP_MS,
} from "@/lib/stage/chorus-sign";
import type { LyricLine } from "@/lib/song-context/schema";

const timed: LyricLine = {
  startMs: 10_000,
  endMs: 12_000,
  text: "hoch die Hände",
  words: [
    { startMs: 10_000, endMs: 10_400, text: "hoch" },
    { startMs: 10_500, endMs: 10_800, text: "die" },
    { startMs: 11_000, endMs: 12_000, text: "Hände" },
  ],
};
const plain: LyricLine = { startMs: 13_000, endMs: 15_000, text: "alle zusammen jetzt" };
const lines = [timed, plain];
const chorus = (ms: number) => ms >= 9_000 && ms < 20_000;

describe("Leuchtschrift im Refrain", () => {
  it("Wörter mit Timing genau, ohne Timing gleichmäßig in den ersten 80 % der Zeile", () => {
    expect(signWords(timed).map((w) => w.startMs)).toEqual([10_000, 10_500, 11_000]);
    const w = signWords(plain);
    expect(w.map((x) => x.text)).toEqual(["alle", "zusammen", "jetzt"]);
    expect(w[1]!.startMs).toBeCloseTo(13_000 + (2000 * 0.8) / 3);
  });

  it("Wörter leuchten auf, wenn sie gesungen werden; das jüngste springt kurz auf", () => {
    expect(signAt(lines, 0, 10_100, chorus)).toMatchObject({ lit: 1 });
    const s = signAt(lines, 0, 10_550, chorus)!;
    expect(s.lit).toBe(2);
    expect(s.pop).toBeCloseTo(1 - 50 / WORD_POP_MS);
    expect(signAt(lines, 0, 11_500, chorus)).toMatchObject({ lit: 3, pop: 0, amount: 1 });
  });

  it("blendet ein und nach dem Zeilenende aus", () => {
    expect(signAt(lines, 0, 10_000 + SIGN_FADE_IN_MS / 2, chorus)!.amount).toBeCloseTo(0.5);
    // nächste Zeile beginnt 1 s nach dem Ende: Ausblenden direkt nach dem Ende
    expect(signAt(lines, 0, 12_000 + SIGN_FADE_OUT_MS / 2, chorus)!.amount).toBeCloseTo(0.5);
    expect(signAt(lines, 0, 12_000 + SIGN_FADE_OUT_MS + 1, chorus)).toBeNull();
    // folgt die nächste Zeile dicht, ist die Schrift vorher weg
    const tight = [{ ...timed, endMs: 13_100 }, plain];
    expect(signAt(tight, 0, 12_999, chorus)?.amount ?? 0).toBeLessThan(0.05);
  });

  it("nur im Refrain, nicht vor der Zeile, keine überlangen Zeilen", () => {
    expect(signAt(lines, 0, 10_100, () => false)).toBeNull();
    expect(signAt(lines, 0, 9_000, chorus)).toBeNull();
    expect(signAt(lines, -1, 9_000, chorus)).toBeNull();
    const long = [{ ...plain, text: "x".repeat(MAX_SIGN_CHARS + 1) }];
    expect(signAt(long, 0, 13_500, chorus)).toBeNull();
  });

  it("weicht der oberen Leiste aus (Titel, Plaketten)", () => {
    expect(hudClearance(0.2)).toBe(1);
    expect(hudClearance(HUD_TOP_NDC)).toBe(0);
    expect(hudClearance(0.9)).toBe(0);
    expect(hudClearance(HUD_TOP_NDC - 0.075)).toBeCloseTo(0.5);
  });
});
