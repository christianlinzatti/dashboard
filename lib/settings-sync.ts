import { z } from "zod";
import { secondLineModes } from "@/lib/lyrics/second-line";
import { themeIds } from "@/lib/stage/themes";

/**
 * Geräte-Einstellungen im Konto: Was man am Pi, Handy oder Laptop einstellt, gilt überall – bis auf die Qualitätsstufe,
 * die zur Hardware gehört (der Pi braucht „niedrig“, der Laptop kann „hoch“). Es gilt die zuletzt gemachte Änderung.
 */
export const SHARED_SETTINGS = ["strobe", "lamps", "secondLine", "stage", "canvas", "crowdSound", "ai"] as const;

export const sharedSettingsSchema = z.object({
  strobe: z.boolean(),
  lamps: z.boolean(),
  secondLine: z.enum(secondLineModes),
  stage: z.enum(["auto", ...themeIds]),
  canvas: z.enum(["aus", "buehne", "vollbild"]),
  crowdSound: z.boolean(),
  // später dazugekommen: ältere Stände im Konto haben es nicht – dann wie bisher an
  ai: z.boolean().default(true),
});
export type SharedSettings = z.infer<typeof sharedSettingsSchema>;

/** Stand im Konto: die Einstellungen und wann sie (auf irgendeinem Gerät) zuletzt geändert wurden */
export const deviceSettingsSchema = z.object({
  settings: sharedSettingsSchema,
  at: z.number().int().nonnegative(),
});
export type DeviceSettings = z.infer<typeof deviceSettingsSchema>;

export function sharedOf(s: SharedSettings): SharedSettings {
  return Object.fromEntries(SHARED_SETTINGS.map((k) => [k, s[k]])) as SharedSettings;
}

/** Unterscheiden sich zwei Stände in einer geteilten Einstellung? */
export const sharedDiffers = (a: SharedSettings, b: SharedSettings) => SHARED_SETTINGS.some((k) => a[k] !== b[k]);

/**
 * Neuer Stand im Konto: nur, wenn er jünger ist als der gespeicherte. Zeitstempel aus der Zukunft (falsch gehende
 * Uhr) werden auf „jetzt“ begrenzt, sonst könnte ein Gerät alle späteren Änderungen der anderen blockieren.
 */
export function mergeDeviceSettings(
  stored: DeviceSettings | undefined,
  incoming: DeviceSettings,
  now: number,
): DeviceSettings | null {
  const at = Math.min(incoming.at, now);
  if (stored && stored.at >= at) return null;
  return { settings: incoming.settings, at };
}
