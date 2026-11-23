import { lyricsProviderStatus } from "@/lib/lyrics/service";
import { canvasStatus } from "@/lib/spotify/canvas-service";
import { readSession } from "@/lib/server/session";
import { json } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";

/** Betriebszustand der Lyrics-Provider (nur angemeldet; für /debug). */
export async function GET() {
  const session = await readSession();
  if (!session) return json({ error: "Nicht angemeldet." }, 401);
  return json({ providers: [...lyricsProviderStatus(), canvasStatus()], now: Date.now() });
}
