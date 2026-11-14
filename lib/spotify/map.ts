import { SCHEMA_VERSION, type SongStatic } from "@/lib/song-context/schema";
import { avatarForArtist, buildCast } from "@/lib/avatars/casting";
import type { SpotifyTrack } from "./types";

/** Standardfarben, bis die Cover-Palette berechnet ist. */
export const defaultPalette = { dominant: "#7b2cff", accent: "#ff4fd8", dark: "#0b0712", light: "#f3e8ff" };

/** Farbe pro Artist (Namensschild, Lyric-Zeile) – kräftige, gut unterscheidbare Töne. */
const artistColors = ["#ff4fd8", "#3ee6ff", "#ffd23f", "#39ff88", "#ff8a3d", "#a78bfa"];

const featureInTitle = /\((?:feat\.?|ft\.?|featuring|with)\s+[^)]+\)|\s[-–]\s(?:feat\.?|ft\.?)\s/i;

export function trackKeyOf(track: SpotifyTrack) {
  return track.id ?? `local:${track.artists.map((a) => a.name).join(",")}|${track.name}|${track.duration_ms}`;
}

/** Größtes Cover, aber nicht unnötig riesig (≤ 640 px reicht für 10"). */
export function pickCover(images: SpotifyTrack["album"]["images"]) {
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) <= 640) ?? sorted[0])?.url ?? "";
}

/**
 * Baut die Stammdaten des Song-Kontexts aus einem Spotify-Track.
 * Lyrics, Genres, Infos und Palette werden später angereichert.
 */
export function songFromTrack(track: SpotifyTrack, opts: { genres?: Record<string, string[]> } = {}): SongStatic {
  const trackKey = trackKeyOf(track);
  const taken = new Set<string>();
  const artists = track.artists.map((a, i) => {
    const id = a.id ?? `name:${a.name}`;
    const genres = opts.genres?.[id] ?? [];
    const avatarId = avatarForArtist(id, genres, taken);
    taken.add(avatarId);
    return {
      spotifyId: id,
      name: a.name,
      role: i === 0 ? ("main" as const) : ("feature" as const),
      genres,
      images: [],
      avatarId,
      color: artistColors[i % artistColors.length]!,
    };
  });
  const genres = [...new Set(artists.flatMap((a) => a.genres))];
  const isFeature = artists.length > 1 || featureInTitle.test(track.name);

  return {
    schemaVersion: SCHEMA_VERSION,
    trackKey,
    track: {
      spotifyId: track.id ?? trackKey,
      ...(track.external_ids?.isrc ? { isrc: track.external_ids.isrc } : {}),
      title: track.name,
      durationMs: track.duration_ms,
      explicit: track.explicit,
      ...(track.album.release_date ? { releaseDate: track.album.release_date } : {}),
      isFeature,
    },
    artists,
    album: { name: track.album.name, coverUrl: pickCover(track.album.images), palette: defaultPalette },
    music: { genres },
    cast: buildCast({ trackKey, genres, artists }),
    status: {
      spotify: { state: "ok", provider: "spotify", updatedAt: Date.now() },
      lyrics: { state: "idle" },
      palette: { state: "loading" },
      music: { state: genres.length ? "ok" : "missing", provider: "spotify" },
      info: { state: "idle" },
    },
  };
}
