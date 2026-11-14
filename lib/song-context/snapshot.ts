import { z } from "zod";
import type { SongContextState } from "./store";
import type { LightFrame } from "@/lib/stage/lights";

/**
 * Kompakter Stand des Song-Kontexts für den Server (Alexa, Pi-Bridge).
 * Bewusst klein: keine Lyrics-Volltexte, nur die aktuelle Zeile.
 */
export const snapshotSchema = z.object({
  trackKey: z.string().max(200),
  title: z.string().max(300),
  artists: z.array(z.object({ name: z.string().max(200), role: z.enum(["main", "feature"]) })).max(12),
  album: z.string().max(300),
  isPlaying: z.boolean(),
  positionMs: z.number().nonnegative(),
  durationMs: z.number().positive(),
  section: z.string().max(20).nullable(),
  activeSinger: z.string().max(200).nullable(),
  line: z.string().max(500).nullable(),
  bpm: z.number().positive().max(400),
  palette: z.object({ dominant: z.string().max(9), accent: z.string().max(9) }),
  light: z
    .object({
      scene: z.string().max(20),
      base: z.string().max(9),
      accent: z.string().max(9),
      brightness: z.number().min(0).max(2),
    })
    .nullable(),
  updatedAt: z.number(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

/** Befehle an das Dashboard (z. B. von Alexa), abgeholt mit der nächsten Meldung. */
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("lampen"), on: z.boolean() }),
  z.object({ type: z.literal("strobo"), on: z.boolean() }),
  z.object({ type: z.literal("qualitaet"), value: z.enum(["auto", "niedrig", "mittel", "hoch"]) }),
]);
export type CommandInput = z.infer<typeof commandSchema>;
export type Command = CommandInput & { id: string; createdAt: number };

export function buildSnapshot(
  s: Pick<SongContextState, "song" | "playback" | "positionMs" | "derived" | "live">,
  light: LightFrame | null,
): Snapshot | null {
  const song = s.song;
  if (!song) return null;
  const line = s.derived.lineActive ? song.lyrics?.lines[s.derived.lineIdx]?.text : undefined;
  const singer = song.artists.find((a) => a.spotifyId === s.derived.activeSingerId)?.name;
  return {
    trackKey: song.trackKey,
    title: song.track.title,
    artists: song.artists.map((a) => ({ name: a.name, role: a.role })),
    album: song.album.name,
    isPlaying: s.playback.isPlaying,
    positionMs: Math.round(s.positionMs),
    durationMs: song.track.durationMs,
    section: s.derived.section,
    activeSinger: singer ?? null,
    line: line ?? null,
    bpm: Math.round(s.live.bpm),
    palette: { dominant: song.album.palette.dominant, accent: song.album.palette.accent },
    light: light
      ? { scene: light.scene, base: light.signal.base, accent: light.signal.accent, brightness: light.signal.brightness }
      : null,
    updatedAt: Date.now(),
  };
}
