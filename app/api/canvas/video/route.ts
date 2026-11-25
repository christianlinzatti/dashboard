import { z } from "zod";
import { canvasFor } from "@/lib/spotify/canvas-service";
import { isCanvasMediaUrl, mediaHeaders } from "@/lib/spotify/canvas-media";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";

const idSchema = z.string().regex(/^[A-Za-z0-9]{22}$/);

/**
 * Canvas-Video (oder -Bild) eines Tracks über die eigene Domain – nur angemeldet, nur die Datei, die Spotify für diesen
 * Track nennt (kein freier Proxy). Range-Anfragen gehen durch, damit der Browser spulen und loopen kann.
 */
export async function GET(req: Request) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const parsed = idSchema.safeParse(new URL(req.url).searchParams.get("track"));
  if (!parsed.success) return json({ error: "Ungültige Track-ID." }, 400);
  try {
    const canvas = await canvasFor(parsed.data, AbortSignal.timeout(8000));
    if (!canvas || !isCanvasMediaUrl(canvas.url)) return json({ error: "Kein Canvas." }, 404);
    const range = req.headers.get("range");
    const upstream = await fetch(canvas.url, {
      headers: range && /^bytes=\d*-\d*$/.test(range) ? { range } : {},
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
    if (!upstream.ok || !upstream.body) return json({ error: `Canvas-Server antwortet mit ${upstream.status}.` }, 502);
    return new Response(upstream.body, { status: upstream.status, headers: mediaHeaders(upstream.headers) });
  } catch {
    return json({ error: "Canvas nicht erreichbar." }, 502);
  }
}
