import type { NextRequest } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";
import { showFor } from "@/lib/show/service";

export const dynamic = "force-dynamic";
// der erste Aufruf je Song fragt die KI-Regie (einige Sekunden); danach kommt alles aus dem Cache
export const maxDuration = 60;

const SEP = "\u001f";
const query = z.object({
  track: z.string().min(1).max(200),
  title: z.string().min(1).max(300),
  artists: z.string().min(1).max(1500),
  album: z.string().max(300).optional(),
  year: z.coerce.number().int().min(1800).max(2200).optional(),
  durationMs: z.coerce
    .number()
    .int()
    .min(1000)
    .max(4 * 3600_000),
});

/** Regie für den aktuellen Song: Genres/Stimmung aus offenen Quellen und – wenn eingerichtet – der KI-Brief (nur angemeldet). */
export async function GET(req: NextRequest) {
  if (!(await readSession())) return json({ error: "Nicht angemeldet." }, 401);
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return json({ error: "Ungültige Anfrage." }, 400);
  const { track, artists, ...rest } = q.data;
  return json(await showFor({ trackKey: track, artists: artists.split(SEP).filter(Boolean), ...rest }));
}
