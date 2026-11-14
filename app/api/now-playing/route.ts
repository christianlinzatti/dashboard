import { currentlyPlayingSchema, spotifyTrackSchema, type NowPlaying } from "@/lib/spotify/types";
import { json, withSpotify } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";

/** Aktueller Wiedergabe-Status (nur das Nötigste; Stammdaten baut der Client per songFromTrack). */
export async function GET() {
  return withSpotify(async (call, session) => {
    const res = await call("/me/player/currently-playing?additional_types=track");
    if (res.status === 204) return json({ state: "idle", user: session.name } satisfies NowPlaying & { user: string });
    if (res.status === 429) return json({ error: "Spotify-Limit erreicht", retryAfter: Number(res.headers.get("retry-after") ?? 5) }, 429);
    if (!res.ok) return json({ error: `Spotify antwortet mit ${res.status}` }, 502);

    const parsed = currentlyPlayingSchema.safeParse(await res.json());
    if (!parsed.success || !parsed.data.item) return json({ state: "idle", user: session.name });
    const track = spotifyTrackSchema.safeParse(parsed.data.item);
    if (!track.success) {
      return json({ state: "unsupported", type: parsed.data.currently_playing_type ?? "unbekannt", user: session.name });
    }

    const body: NowPlaying & { user: string } = {
      state: parsed.data.is_playing ? "playing" : "paused",
      progressMs: parsed.data.progress_ms ?? 0,
      fetchedAt: Date.now(),
      device: parsed.data.device?.name,
      volume: parsed.data.device?.volume_percent ?? undefined,
      track: track.data,
      user: session.name,
    };
    return json(body);
  });
}
