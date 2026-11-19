import { describe, expect, it } from "vitest";
import { inQuietHours, quietHoursFromParam, quietHoursSchema, screenOff, WAKE_MS } from "@/lib/live/quiet-hours";

const at = (h: number, m = 0) => new Date(2026, 10, 20, h, m);
const night = { from: "23:00", to: "07:00" };

describe("Display-Zeitplan", () => {
  it("Ruhezeit über Mitternacht und tagsüber", () => {
    expect([at(22, 59), at(23), at(2), at(6, 59), at(7)].map((d) => inQuietHours(night, d))).toEqual([
      false,
      true,
      true,
      true,
      false,
    ]);
    const noon = { from: "12:00", to: "14:30" };
    expect([at(11, 59), at(12), at(14, 29), at(14, 30)].map((d) => inQuietHours(noon, d))).toEqual([false, true, true, false]);
    expect(inQuietHours(null, at(2))).toBe(false);
  });

  it("schwarz nur ohne Musik und nicht kurz nach dem Antippen", () => {
    expect(screenOff(night, at(2), false, null)).toBe(true);
    expect(screenOff(night, at(2), true, null)).toBe(false);
    expect(screenOff(night, at(12), false, null)).toBe(false);
    const woke = at(2).getTime();
    expect(screenOff(night, new Date(woke + WAKE_MS - 1000), false, woke)).toBe(false);
    expect(screenOff(night, new Date(woke + WAKE_MS), false, woke)).toBe(true);
  });

  it("Eingaben prüfen", () => {
    expect(quietHoursSchema.safeParse(night).success).toBe(true);
    expect(quietHoursSchema.safeParse({ from: "24:00", to: "07:00" }).success).toBe(false);
    expect(quietHoursSchema.safeParse({ from: "07:00", to: "07:00" }).success).toBe(false);
    expect(quietHoursFromParam("23:00-07:00")).toEqual(night);
    expect(quietHoursFromParam("kaputt")).toBeUndefined();
  });
});
