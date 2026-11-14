import { z } from "zod";

/**
 * Nur die Felder, die wir wirklich brauchen – alles Weitere ist optional,
 * weil Spotify im Entwicklungsmodus Felder entfernt hat (Feb. 2026).
 */
export const spotifyImageSchema = z.object({
  url: z.string(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
});

export const spotifyTrackSchema = z.object({
  id: z.string().nullable(),
  type: z.literal("track"),
  name: z.string(),
  duration_ms: z.number(),
  explicit: z.boolean().optional().default(false),
  is_local: z.boolean().optional(),
  uri: z.string().optional(),
  external_ids: z.object({ isrc: z.string().optional() }).partial().optional(),
  artists: z.array(z.object({ id: z.string().nullable(), name: z.string() })).min(1),
  album: z.object({
    name: z.string(),
    release_date: z.string().optional(),
    images: z.array(spotifyImageSchema).default([]),
  }),
});
export type SpotifyTrack = z.infer<typeof spotifyTrackSchema>;

export const currentlyPlayingSchema = z.object({
  is_playing: z.boolean(),
  progress_ms: z.number().nullable(),
  currently_playing_type: z.string().optional(),
  item: z.unknown().nullable(),
  device: z.object({ name: z.string(), volume_percent: z.number().nullable().optional() }).partial().optional(),
});

/** Antwort von /api/now-playing an den Browser. */
export type NowPlaying =
  | { state: "idle" }
  | { state: "unsupported"; type: string }
  | {
      state: "playing" | "paused";
      progressMs: number;
      /** Serverzeit beim Abruf (ms) */
      fetchedAt: number;
      device?: string;
      volume?: number;
      track: SpotifyTrack;
    };
