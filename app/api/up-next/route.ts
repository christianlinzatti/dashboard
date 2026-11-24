import { z } from "zod";
import { spotifyTrackSchema } from "@/lib/spotify/types";
import { json, withSpotify } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";

const queueSchema = z.object({ queue: z.array(z.unknown()).default([]) });

/**
 * Der nächste Titel aus der Spotify-Warteschlange (für „Gleich kommt …“ und zum Vorladen). Podcasts und andere
 * Einträge ohne Track-Daten zählen nicht. Ohne Warteschlange: `{ track: null }`.
 */
export async function GET() {
  return withSpotify(async (call) => {
    const res = await call("/me/player/queue");
    if (res.status === 204) return json({ track: null });
    if (res.status === 429) return json({ error: "Spotify-Limit erreicht" }, 429);
    if (!res.ok) return json({ error: `Spotify antwortet mit ${res.status}` }, 502);
    const parsed = queueSchema.safeParse(await res.json());
    const first = parsed.success ? parsed.data.queue[0] : undefined;
    const track = spotifyTrackSchema.safeParse(first);
    return json({ track: track.success && !track.data.is_local ? track.data : null });
  });
}
