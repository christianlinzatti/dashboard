import { lastfmFromEnv, recentTracks } from "@/lib/personal/service";
import { json, withSpotify } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";

/** Zuletzt gehörte Songs (Last.fm, sonst Spotify). */
export async function GET() {
  return withSpotify(async (call) => json(await recentTracks({ spotify: (p) => call(p), lastfm: lastfmFromEnv() })));
}
