import { z } from "zod";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";
import { GALLERY_MAX, PHOTO_ID, photoStore } from "@/lib/server/photo-store";

export const dynamic = "force-dynamic";

const body = z.object({ ids: z.array(z.string().regex(PHOTO_ID)).min(1).max(GALLERY_MAX) });

/** Galerie des Abends anlegen (nur angemeldet): Liste vorhandener Foto-Adressen → { id } für /foto/abend/<id> */
export async function POST(req: Request) {
  if (!(await readSession())) return json({ error: "Nicht angemeldet." }, 401);
  if (Number(req.headers.get("content-length") ?? 0) > 4096) return json({ error: "Zu groß." }, 413);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Ungültige Anfrage." }, 400);
  return json({ id: await photoStore().putGallery([...new Set(parsed.data.ids)]) });
}
