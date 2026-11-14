import { z } from "zod";
import type { NextRequest } from "next/server";
import { lyricsFor } from "@/lib/lyrics/service";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";

const query = z.object({
  trackKey: z.string().min(1).max(200),
  spotifyId: z.string().max(100).optional(),
  isrc: z.string().max(20).optional(),
  title: z.string().min(1).max(300),
  artists: z.string().min(1).max(500),
  album: z.string().max(300).optional(),
  durationMs: z.coerce.number().int().positive().max(3 * 3600_000),
});

/** Lyrics für den aktuellen Song (nur für angemeldete Nutzer – Texte nicht öffentlich ausliefern). */
export async function GET(req: NextRequest) {
  if (!(await readSession())) return json({ error: "Nicht angemeldet." }, 401);
  const parsed = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return json({ error: "Ungültige Anfrage." }, 400);
  const { artists, ...rest } = parsed.data;
  const result = await lyricsFor({ ...rest, artists: artists.split("\u001f").filter(Boolean) });
  return json(result);
}
