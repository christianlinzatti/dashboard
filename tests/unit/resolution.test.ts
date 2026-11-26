import { describe, expect, it } from "vitest";
import {
  AFTER_QUALITY_DOWN,
  maxDpr,
  MIN_RESOLUTION,
  onDecline,
  onIncline,
  RESOLUTION_STEP,
  resolutionPercent,
  stageDpr,
} from "@/lib/stage/resolution";
import { PRESETS } from "@/lib/stage/quality";

describe("Anpassbare Auflösung", () => {
  it("volle Pixeldichte: Gerät, begrenzt durch die Stufe", () => {
    expect(maxDpr(PRESETS.mittel.dpr, 2)).toBe(1.25); // Notebook mit hochauflösendem Bildschirm
    expect(maxDpr(PRESETS.hoch.dpr, 2)).toBe(1.5);
    expect(maxDpr(PRESETS.mittel.dpr, 1)).toBe(1);
    expect(maxDpr(PRESETS.niedrig.dpr, 3)).toBe(1);
  });

  it("Faktor 1 = volle Auflösung, 0 = 60 %, gerundet auf 0,05", () => {
    expect(stageDpr(PRESETS.mittel.dpr, 2, 1)).toBe(1.25);
    expect(stageDpr(PRESETS.mittel.dpr, 2, 0)).toBe(0.75);
    expect(stageDpr(PRESETS.niedrig.dpr, 1, 0)).toBe(MIN_RESOLUTION);
    expect(stageDpr(PRESETS.hoch.dpr, 2, 0.5)).toBe(1.2);
    expect(stageDpr(PRESETS.mittel.dpr, 2, 7)).toBe(1.25); // begrenzt
    expect(resolutionPercent(1)).toBe(100);
    expect(resolutionPercent(0)).toBe(60);
    expect(resolutionPercent(0.6)).toBe(84);
  });

  it("zu langsam: erst die Auflösung (zwei Schritte), dann bei „auto“ eine Stufe herunter", () => {
    let f = 1;
    const steps: string[] = [];
    for (let i = 0; i < 5; i++) {
      f = Math.max(0, Math.round((f - RESOLUTION_STEP) * 10) / 10); // so senkt der Monitor
      const s = onDecline(f, true, "mittel");
      steps.push(s.quality ?? `auflösung ${resolutionPercent(f)} %`);
      if (s.quality) break;
    }
    expect(steps).toEqual(["auflösung 92 %", "auflösung 84 %", "runter"]);
    expect(onDecline(0.4, true, "mittel").factor).toBe(AFTER_QUALITY_DOWN);
    // feste Qualität: nur die Auflösung; auf „niedrig“ geht es nicht weiter herunter
    expect(onDecline(0.1, false, "hoch")).toEqual({ factor: 0.1, quality: null });
    expect(onDecline(0.1, true, "niedrig")).toEqual({ factor: 0.1, quality: null });
  });

  it("schnell genug: erst volle Auflösung, dann bei „auto“ eine Stufe hinauf", () => {
    expect(onIncline(0.8, true, "mittel", false).quality).toBeNull();
    expect(onIncline(1, true, "mittel", true).quality).toBe("hinauf");
    expect(onIncline(1, false, "mittel", true).quality).toBeNull();
    expect(onIncline(1, true, "hoch", true).quality).toBeNull();
  });
});
