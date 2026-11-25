import "server-only";
import { z } from "zod";
import { home } from "@/lib/concerts/geo";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import { artistAvatarsSchema, avatarStyles } from "@/lib/avatars/overrides";
import { quietHoursSchema } from "@/lib/live/quiet-hours";
import { deviceSettingsSchema } from "@/lib/settings-sync";

/** Einstellungen pro Spotify-Konto (geräteübergreifend, z. B. vom Handy gesetzt). */
export const prefsSchema = z.object({
  home: z
    .object({ name: z.string().min(1).max(100), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) })
    .optional(),
  radiusKm: z.number().int().min(10).max(20_000).optional(),
  /** eigener Avatar (und Outfit) je Künstler, Schlüssel: artistKey(Name) */
  artistAvatars: artistAvatarsSchema.optional(),
  /** Avatar-Stil: gemischt (Standard) oder nur Chibis */
  avatarStyle: z.enum(avatarStyles).optional(),
  /** Display-Zeitplan: Bildschirm in dieser Zeit schwarz, solange keine Musik läuft */
  quietHours: quietHoursSchema.optional(),
  /** Geräte-Einstellungen (Strobo, Lampen, 2. Zeile, Bühne, Canvas, Publikumsgeräusche) – auf allen Geräten gleich */
  device: deviceSettingsSchema.optional(),
});
export type Prefs = z.infer<typeof prefsSchema>;

const TTL = 400 * 24 * 3600; // gut ein Jahr, bei jedem Speichern verlängert

export function createPrefsStore(cache: Cache = getCache()) {
  const key = (uid: string) => `prefs:v1:${uid}`;
  return {
    async get(uid: string): Promise<Prefs> {
      const raw = await cache.get<unknown>(key(uid));
      const p = prefsSchema.safeParse(raw ?? {});
      return p.success ? p.data : {};
    },
    async set(uid: string, prefs: Prefs) {
      await cache.set(key(uid), prefsSchema.parse(prefs), TTL);
    },
  };
}

let shared: ReturnType<typeof createPrefsStore> | undefined;
export const prefsStore = () => (shared ??= createPrefsStore());

/** Wirksamer Konzert-Bereich: eigene Einstellung, sonst Server-Standard (Env, Wien). */
export function effectiveArea(p: Prefs) {
  const d = home();
  return {
    name: p.home?.name ?? d.name,
    lat: p.home?.lat ?? d.lat,
    lon: p.home?.lon ?? d.lon,
    radiusKm: p.radiusKm ?? d.radiusKm,
    custom: !!(p.home || p.radiusKm),
  };
}
