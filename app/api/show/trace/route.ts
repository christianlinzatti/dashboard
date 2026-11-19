import type { NextRequest } from "next/server";
import { z } from "zod";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";
import { showTrace } from "@/lib/show/service";

export const dynamic = "force-dynamic";

const query = z.object({ track: z.string().min(1).max(200) });

/** Komplette Frage und Antwort der KI-Regie zum Song (Debug-Panel, /debug; nur angemeldet). */
export async function GET(req: NextRequest) {
  if (!(await readSession())) return json({ error: "Nicht angemeldet." }, 401);
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return json({ error: "Ungültige Anfrage." }, 400);
  return json(await showTrace(q.data.track));
}
