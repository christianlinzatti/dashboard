import { z } from "zod";
import { geocodePlace } from "@/lib/concerts/geocode";
import { createPoliteFetch } from "@/lib/info/http";
import { effectiveArea, prefsStore, type Prefs } from "@/lib/server/prefs-store";
import { artistAvatarSchema, artistKey, avatarStyles, MAX_ARTIST_AVATARS } from "@/lib/avatars/overrides";
import { quietHoursSchema } from "@/lib/live/quiet-hours";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";
const geoHttp = createPoliteFetch({ minIntervalMs: { "nominatim.openstreetmap.org": 1100 } });

export async function GET() {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  return json(view(await prefsStore().get(session.uid)));
}

const view = (p: Prefs) => ({
  area: effectiveArea(p),
  artistAvatars: p.artistAvatars ?? {},
  quietHours: p.quietHours ?? null,
  avatarStyle: p.avatarStyle ?? "gemischt",
});

const body = z.object({
  /** neuer Heimatort (frei eingegeben); null = zurück zum Standard */
  home: z.string().trim().min(2).max(100).nullable().optional(),
  /** Umkreis in km; null = Standard */
  radiusKm: z.number().int().min(10).max(20_000).nullable().optional(),
  /** Ruhezeit setzen (null = aus) */
  quietHours: quietHoursSchema.nullable().optional(),
  /** Avatar-Stil für alle Figuren */
  avatarStyle: z.enum(avatarStyles).optional(),
  /** Avatar für einen Künstler festlegen; ohne avatarId: Zuordnung entfernen */
  artistAvatar: z
    .union([artistAvatarSchema, z.object({ name: z.string().trim().min(1).max(120), avatarId: z.null() })])
    .optional(),
});

export async function PUT(req: Request) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const b = body.safeParse(await req.json().catch(() => null));
  if (!b.success) return json({ error: "Ungültige Eingabe." }, 400);
  const prefs = await prefsStore().get(session.uid);
  if (b.data.home === null) delete prefs.home;
  else if (b.data.home) {
    const place = await geocodePlace(b.data.home, geoHttp, AbortSignal.timeout(8000)).catch(() => undefined);
    if (place === undefined) return json({ error: "Ortssuche gerade nicht erreichbar." }, 502);
    if (!place) return json({ error: `„${b.data.home}“ wurde nicht gefunden.` }, 404);
    prefs.home = place;
  }
  if (b.data.radiusKm === null) delete prefs.radiusKm;
  else if (b.data.radiusKm) prefs.radiusKm = b.data.radiusKm;
  if (b.data.quietHours === null) delete prefs.quietHours;
  else if (b.data.quietHours) prefs.quietHours = b.data.quietHours;
  if (b.data.avatarStyle === "gemischt") delete prefs.avatarStyle;
  else if (b.data.avatarStyle) prefs.avatarStyle = b.data.avatarStyle;
  const pick = b.data.artistAvatar;
  if (pick) {
    const map = { ...prefs.artistAvatars };
    const key = artistKey(pick.name);
    if (pick.avatarId === null) delete map[key];
    else {
      if (!map[key] && Object.keys(map).length >= MAX_ARTIST_AVATARS)
        return json({ error: `Höchstens ${MAX_ARTIST_AVATARS} Künstler.` }, 400);
      map[key] = {
        name: pick.name,
        avatarId: pick.avatarId,
        ...(pick.outfit ? { outfit: pick.outfit } : {}),
        ...(pick.trim ? { trim: pick.trim } : {}),
        ...(pick.look && Object.keys(pick.look).length ? { look: pick.look } : {}),
      };
    }
    prefs.artistAvatars = map;
  }
  await prefsStore().set(session.uid, prefs);
  return json(view(prefs));
}
