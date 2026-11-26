import { z } from "zod";
import { canvasFor } from "@/lib/spotify/canvas-service";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";

const idSchema = z.string().regex(/^[A-Za-z0-9]{22}$/);

/** Spotify Canvas für einen Track (nur angemeldet). Ohne Konfiguration/bei Pause: canvas = null. */
export async function GET(req: Request) {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  const id = new URL(req.url).searchParams.get("track");
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return json({ error: "Ungültige Track-ID." }, 400);
  try {
    const canvas = await canvasFor(parsed.data, AbortSignal.timeout(8000));
    return json({ canvas });
  } catch (e) {
    // für /debug: abgelehnt oder Zeitüberschreitung ist etwas anderes als „dieser Song hat keins“
    const msg = e instanceof Error ? (e.name === "TimeoutError" ? "Zeitüberschreitung" : e.message) : String(e);
    return json({ canvas: null, error: msg.replace(/(token|cookie|sp_dc)=[^&\s]+/gi, "$1=…").slice(0, 160) });
  }
}
