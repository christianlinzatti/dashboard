import type { NextRequest } from "next/server";
import { z } from "zod";
import { germanLyricsFor } from "@/lib/lyrics/translate";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";
// der erste Aufruf je Song fragt die KI (einige Sekunden); danach kommt alles aus dem Cache
export const maxDuration = 60;

const query = z.object({ track: z.string().min(1).max(200) });

/**
 * Deutsche Übersetzung des Liedtexts für den aktuellen Song (nur angemeldet). Übersetzt nur, was für diesen Song im
 * Lyrics-Cache liegt und nicht deutsch ist; Antwort: Übersetzung je Zeilentext (`byText`).
 */
export async function GET(req: NextRequest) {
  if (!(await readSession())) return json({ error: "Nicht angemeldet." }, 401);
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return json({ error: "Ungültige Anfrage." }, 400);
  return json(await germanLyricsFor(q.data.track));
}
