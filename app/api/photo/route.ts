import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";
import { isJpeg, PHOTO_MAX_BYTES, photoStore } from "@/lib/server/photo-store";

export const dynamic = "force-dynamic";

/** Zuletzt hochgeladen je Nutzer – mehr als ein Foto alle 3 s braucht niemand */
const last = new Map<string, number>();
const MIN_GAP_MS = 3000;

/** Erinnerungsfoto vom Kiosk hochladen (nur angemeldet). Antwort: { id } für /foto/<id>. */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  if (!req.headers.get("content-type")?.startsWith("image/jpeg")) return json({ error: "Nur JPEG." }, 415);
  const now = Date.now();
  if (now - (last.get(session.uid) ?? 0) < MIN_GAP_MS) return json({ error: "Zu schnell hintereinander." }, 429);
  // angekündigte Größe zuerst prüfen: zu große Anfragen gar nicht erst einlesen
  if (Number(req.headers.get("content-length") ?? 0) > PHOTO_MAX_BYTES) return json({ error: "Foto zu groß." }, 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > PHOTO_MAX_BYTES) return json({ error: "Foto zu groß." }, 413);
  if (!isJpeg(bytes)) return json({ error: "Kein JPEG." }, 400);
  last.set(session.uid, now);
  return json({ id: await photoStore().put(bytes) });
}
