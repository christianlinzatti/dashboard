import { describe, expect, it } from "vitest";
import { parsePerfSample, perfGrade, perfMessage, summarizePerf } from "@/lib/live/perf-samples";

describe("Leistungsproben (Bildrate je Bühne)", () => {
  it("schreibt und liest eine Probe; ältere Proben ohne Mindestwert/Bühne bleiben lesbar", () => {
    const msg = perfMessage({ fps: 31, minFps: 18, quality: "mittel", theme: "club" }, "1280×800");
    expect(msg).toBe("31 fps (min 18), Qualität mittel, Bühne club, 1280×800");
    expect(parsePerfSample({ source: "leistung", message: msg, at: 5 })).toEqual({
      at: 5,
      fps: 31,
      minFps: 18,
      quality: "mittel",
      theme: "club",
    });
    expect(parsePerfSample({ source: "leistung", message: "24 fps, Qualität niedrig, 1024×600", at: 1 })).toEqual({
      at: 1,
      fps: 24,
      minFps: 24,
      quality: "niedrig",
      theme: "?",
    });
    expect(parsePerfSample({ source: "js", message: "31 fps", at: 1 })).toBeNull();
    expect(parsePerfSample({ source: "leistung", message: "kaputt", at: 1 })).toBeNull();
  });

  it("fasst je Bühne und Stufe zusammen, schwächste zuerst; Bewertung flüssig/knapp/ruckelt", () => {
    const s = (fps: number, minFps: number, theme: string, at: number) => ({ at, fps, minFps, quality: "mittel", theme });
    const g = summarizePerf([s(30, 25, "club", 1), s(26, 14, "club", 3), s(45, 40, "jazz", 2)]);
    expect(g).toEqual([
      { theme: "club", quality: "mittel", samples: 2, avgFps: 28, minFps: 14, lastAt: 3 },
      { theme: "jazz", quality: "mittel", samples: 1, avgFps: 45, minFps: 40, lastAt: 2 },
    ]);
    expect([perfGrade(30), perfGrade(22), perfGrade(12)]).toEqual(["flüssig", "knapp", "ruckelt"]);
  });
});
