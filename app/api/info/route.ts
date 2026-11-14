import type { NextRequest } from "next/server";
import { z } from "zod";
import { infoFor } from "@/lib/info/service";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";
// MusicBrainz-Drosselung (1/s) → bei mehreren Artists einige Sekunden
export const maxDuration = 30;

const SEP = "\u001f";
const query = z.object({
  ids: z.string().min(1).max(1000),
  names: z.string().min(1).max(1500),
  title: z.string().max(300).optional(),
});

/** Band-Infos und Fotos für die Artists des aktuellen Songs (nur angemeldet). */
export async function GET(req: NextRequest) {
  if (!(await readSession())) return json({ error: "Nicht angemeldet." }, 401);
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return json({ error: "Ungültige Anfrage." }, 400);
  const ids = q.data.ids.split(SEP);
  const names = q.data.names.split(SEP);
  if (ids.length !== names.length) return json({ error: "Ungültige Anfrage." }, 400);
  const song = q.data.title ? { title: q.data.title } : undefined;
  return json(
    await infoFor(
      ids.map((id, i) => ({ id, name: names[i]! })),
      undefined,
      song,
    ),
  );
}
