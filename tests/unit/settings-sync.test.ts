import { describe, expect, it } from "vitest";
import { deviceSettingsSchema, mergeDeviceSettings, sharedDiffers, sharedOf, type SharedSettings } from "@/lib/settings-sync";

const base: SharedSettings = {
  strobe: true,
  lamps: true,
  secondLine: "auto",
  stage: "auto",
  canvas: "aus",
  crowdSound: false,
  ai: true,
};

describe("Geräte-Einstellungen im Konto", () => {
  it("der jüngere Stand gewinnt; Zeitstempel aus der Zukunft werden auf jetzt begrenzt", () => {
    const stored = { settings: base, at: 1000 };
    expect(mergeDeviceSettings(stored, { settings: { ...base, lamps: false }, at: 900 }, 5000)).toBeNull();
    expect(mergeDeviceSettings(stored, { settings: base, at: 1000 }, 5000)).toBeNull();
    expect(mergeDeviceSettings(stored, { settings: { ...base, lamps: false }, at: 2000 }, 5000)).toEqual({
      settings: { ...base, lamps: false },
      at: 2000,
    });
    expect(mergeDeviceSettings(undefined, { settings: base, at: 99_999 }, 5000)?.at).toBe(5000);
  });

  it("nur die geteilten Einstellungen – die Qualität bleibt beim Gerät", () => {
    const withQuality = { ...base, quality: "hoch" } as SharedSettings & { quality: string };
    expect(sharedOf(withQuality)).toEqual(base);
    expect(sharedDiffers(base, { ...base, canvas: "buehne" })).toBe(true);
    expect(sharedDiffers(base, { ...base })).toBe(false);
  });

  it("prüft, was vom Gerät kommt", () => {
    expect(deviceSettingsSchema.safeParse({ settings: base, at: 1 }).success).toBe(true);
    expect(deviceSettingsSchema.safeParse({ settings: { ...base, stage: "mond" }, at: 1 }).success).toBe(false);
    expect(deviceSettingsSchema.safeParse({ settings: base, at: -1 }).success).toBe(false);
  });
});

describe("KI verwenden (später dazugekommen)", () => {
  it("ältere Stände im Konto ohne „ai“ gelten als an; aus wird übernommen", () => {
    const old: Partial<SharedSettings> = { ...base };
    delete old.ai;
    expect(deviceSettingsSchema.parse({ settings: old, at: 1 }).settings.ai).toBe(true);
    expect(deviceSettingsSchema.parse({ settings: { ...base, ai: false }, at: 1 }).settings.ai).toBe(false);
    expect(sharedDiffers(base, { ...base, ai: false })).toBe(true);
  });
});
