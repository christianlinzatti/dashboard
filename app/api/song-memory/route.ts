import type { NextRequest } from "next/server";
import { z } from "zod";
import { memoryStore } from "@/lib/server/memory-store";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";
import { observationSchema } from "@/lib/song-memory/memory";

export const dynamic = "force-dynamic";

const query = z.object({ track: z.string().min(1).max(200) });

/** Was das Mikrofon früher über diesen Song gemessen hat (nur angemeldet). */
export async function GET(req: NextRequest) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return json({ error: "Ungültige Anfrage." }, 400);
  return json({ memory: await memoryStore().get(session.uid, q.data.track) });
}

/** Kiosk meldet nach einem Song (mit Mikrofon) die gemessenen Drops und das Tempo. */
export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const b = observationSchema.safeParse(await req.json().catch(() => null));
  if (!b.success) return json({ error: "Ungültige Messung." }, 400);
  return json({ memory: await memoryStore().add(session.uid, b.data) });
}
