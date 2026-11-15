import { z } from "zod";
import { geocodePlace } from "@/lib/concerts/geocode";
import { createPoliteFetch } from "@/lib/info/http";
import { effectiveArea, prefsStore } from "@/lib/server/prefs-store";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";
const geoHttp = createPoliteFetch({ minIntervalMs: { "nominatim.openstreetmap.org": 1100 } });

export async function GET() {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  return json({ area: effectiveArea(await prefsStore().get(session.uid)) });
}

const body = z.object({
  /** neuer Heimatort (frei eingegeben); null = zurück zum Standard */
  home: z.string().trim().min(2).max(100).nullable().optional(),
  /** Umkreis in km; null = Standard */
  radiusKm: z.number().int().min(10).max(20_000).nullable().optional(),
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
  await prefsStore().set(session.uid, prefs);
  return json({ area: effectiveArea(prefs) });
}
