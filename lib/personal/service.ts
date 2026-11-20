import "server-only";
import type { UserInfo } from "@/lib/song-context/schema";
import { createLastfm, type RecentTrack } from "./lastfm";
import { artistsFollowed, trackSaved } from "./spotify-library";

type Call = (path: string) => Promise<Response>;
type Http = (url: string, signal?: AbortSignal) => Promise<Response>;

export function lastfmFromEnv(http: Http = (u, s) => fetch(u, { signal: s, cache: "no-store" })) {
  const apiKey = process.env.LASTFM_API_KEY;
  const user = process.env.LASTFM_USER;
  return apiKey && user ? createLastfm({ apiKey, user }, http) : null;
}

/**
 * Likes, Follows und Hörstatistik für den aktuellen Song. Jede Quelle ist optional:
 * Fehler einer Quelle lassen die anderen Werte unberührt.
 */
export async function userInfoFor(
  q: { trackId: string; title: string; artists: Array<{ id: string; name: string }> },
  deps: { spotify: Call; lastfm: ReturnType<typeof createLastfm> | null },
): Promise<UserInfo> {
  const info: UserInfo = { artists: {} };
  const lead = q.artists[0]?.name ?? "";
  const [saved, followed, trackStats, artistStats, similar] = await Promise.all([
    trackSaved(deps.spotify, q.trackId).catch(() => undefined),
    artistsFollowed(
      deps.spotify,
      q.artists.map((a) => a.id),
    ).catch(() => ({}) as Record<string, boolean>),
    deps.lastfm?.trackStats(lead, q.title).catch(() => null) ?? null,
    Promise.all(q.artists.slice(0, 5).map((a) => deps.lastfm?.artistStats(a.name).catch(() => null) ?? null)),
    (lead && deps.lastfm?.similarArtists(lead).catch(() => [])) || [],
  ]);
  if (saved !== undefined) info.trackSaved = saved;
  if (trackStats) {
    info.trackPlays = trackStats.plays;
    info.lovedOnLastfm = trackStats.loved;
  }
  // ähnliche Künstler ohne die, die ohnehin im Song mitspielen
  const own = new Set(q.artists.map((a) => a.name.toLowerCase()));
  const others = similar.filter((n) => !own.has(n.toLowerCase())).slice(0, 5);
  if (others.length) info.similar = others;
  q.artists.forEach((a, i) => {
    const entry: UserInfo["artists"][string] = {};
    if (followed[a.id] !== undefined) entry.following = followed[a.id];
    const st = artistStats[i];
    if (st) entry.plays = st.plays;
    if (Object.keys(entry).length) info.artists[a.id] = entry;
  });
  return info;
}

const recentSpotify = (body: unknown): RecentTrack[] => {
  const items =
    (
      body as {
        items?: Array<{
          played_at?: string;
          track?: {
            name?: string;
            artists?: Array<{ name: string }>;
            album?: { name?: string; images?: Array<{ url: string; width?: number }> };
          };
        }>;
      }
    )?.items ?? [];
  return items.flatMap((it) =>
    it.track?.name
      ? [
          {
            title: it.track.name,
            artist: (it.track.artists ?? []).map((a) => a.name).join(", "),
            album: it.track.album?.name,
            imageUrl: [...(it.track.album?.images ?? [])]
              .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
              .find((i) => (i.width ?? 0) >= 64)?.url,
            playedAt: it.played_at ? Math.floor(Date.parse(it.played_at) / 1000) : undefined,
            nowPlaying: false,
            loved: false,
          },
        ]
      : [],
  );
};

/** Zuletzt gehört: Last.fm (inkl. Scrobbles anderer Geräte), sonst Spotify. */
export async function recentTracks(deps: { spotify: Call; lastfm: ReturnType<typeof createLastfm> | null }) {
  if (deps.lastfm) {
    try {
      return { source: "lastfm" as const, tracks: await deps.lastfm.recentTracks(10) };
    } catch {
      /* Rückfall auf Spotify */
    }
  }
  const res = await deps.spotify("/me/player/recently-played?limit=10");
  return { source: "spotify" as const, tracks: res.ok ? recentSpotify(await res.json()) : [] };
}
