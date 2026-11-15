import type { NextRequest } from "next/server";
import { z } from "zod";
import { tempoFor } from "@/lib/music/tempo-service";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";
const query = z.object({
  isrc: z.string().regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/),
  durationMs: z.coerce.number().int().positive().optional(),
});

/** Tempo-Startwert (BPM) zum Song, solange das Mikrofon noch nicht eingerastet ist. */
export async function GET(req: NextRequest) {
  if (!(await readSession())) return json({ error: "Nicht angemeldet." }, 401);
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return json({ error: "Ungültige Anfrage." }, 400);
  try {
    return json(await tempoFor(q.data.isrc, q.data.durationMs));
  } catch {
    return json({ bpm: null, error: "Tempo-Quelle gerade nicht erreichbar." }, 502);
  }
}
