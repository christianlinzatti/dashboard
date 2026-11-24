import { describe, expect, it } from "vitest";
import { dayPhaseAt, SKY_BY_PHASE } from "@/lib/stage/daylight";

const at = (month: number, hour: number, minute = 0) => new Date(2026, month - 1, 15, hour, minute);

describe("Tageszeit der Freiluftbühnen", () => {
  it("Winter: um 16 Uhr Sonnenuntergang, um 17 Uhr blaue Stunde, ab 18 Uhr Nacht", () => {
    expect(dayPhaseAt(at(12, 13))).toBe("tag");
    expect(dayPhaseAt(at(12, 16))).toBe("abend");
    expect(dayPhaseAt(at(12, 17))).toBe("daemmerung");
    expect(dayPhaseAt(at(12, 18))).toBe("nacht");
    expect(dayPhaseAt(at(12, 23, 30))).toBe("nacht");
  });

  it("Sommer: um 20 Uhr goldene Stunde, um 21:30 Dämmerung, ab 22:15 Nacht; früh morgens Dämmerung", () => {
    expect(dayPhaseAt(at(6, 19))).toBe("tag");
    expect(dayPhaseAt(at(6, 20, 30))).toBe("abend");
    expect(dayPhaseAt(at(6, 21, 30))).toBe("daemmerung");
    expect(dayPhaseAt(at(6, 22, 15))).toBe("nacht");
    expect(dayPhaseAt(at(6, 4, 30))).toBe("daemmerung");
    expect(dayPhaseAt(at(6, 2))).toBe("nacht");
  });

  it("Himmel: Tag ohne Sterne, Nacht mit Mond und vielen Sternen", () => {
    expect(SKY_BY_PHASE.tag.stars).toBe(0);
    expect(SKY_BY_PHASE.nacht.sun).toBe("mond");
    expect(SKY_BY_PHASE.nacht.stars).toBeGreaterThan(SKY_BY_PHASE.abend.stars);
  });
});
