import { z } from "zod";
import type { SongContextState } from "./store";
import type { LightFrame } from "@/lib/stage/lights";
import { topConcerts } from "@/lib/concerts/display";
import type { SongStatic } from "./schema";

/**
 * Kompakter Stand des Song-Kontexts für den Server (Alexa, Pi-Bridge).
 * Bewusst klein und ohne Songtexte.
 */
export const snapshotSchema = z.object({
  trackKey: z.string().max(200),
  title: z.string().max(300),
  artists: z.array(z.object({ name: z.string().max(200), role: z.enum(["main", "feature"]) })).max(12),
  album: z.string().max(300),
  /** Erscheinungsjahr laut Spotify (Album-Veröffentlichung, bei Best-of/Remaster ggf. später) */
  releaseYear: z.number().int().min(1800).max(2200).nullable().optional(),
  isPlaying: z.boolean(),
  positionMs: z.number().nonnegative(),
  durationMs: z.number().positive(),
  section: z.string().max(20).nullable(),
  activeSinger: z.string().max(200).nullable(),
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
  // --- Stufe 4/5 für Alexa (optional, kompakt) ---
  /** Likes, Follows und Hörzahlen; unbekannte Werte fehlen */
  user: z
    .object({
      trackSaved: z.boolean().optional(),
      lovedOnLastfm: z.boolean().optional(),
      trackPlays: z.number().int().nonnegative().optional(),
      artists: z
        .array(
          z.object({
            name: z.string().max(200),
            following: z.boolean().optional(),
            plays: z.number().int().nonnegative().optional(),
          }),
        )
        .max(12),
    })
    .optional(),
  /** nächste Konzerte (Umkreis zuerst) */
  concerts: z
    .array(
      z.object({
        artistName: z.string().max(200),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        city: z.string().max(100),
        venue: z.string().max(200),
        distanceKm: z.number().nonnegative().optional(),
        soldOut: z.boolean().optional(),
      }),
    )
    .max(5)
    .optional(),
  /** Kurzinfos zu den Artists (erster Satz aus Wikipedia, Fakten) */
  about: z
    .array(
      z.object({
        name: z.string().max(200),
        summary: z.string().max(400).optional(),
        facts: z.array(z.string().max(120)).max(4),
      }),
    )
    .max(6)
    .optional(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

/** Befehle an das Dashboard (z. B. von Alexa), abgeholt mit der nächsten Meldung. */
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("lampen"), on: z.boolean() }),
  z.object({ type: z.literal("strobo"), on: z.boolean() }),
  z.object({ type: z.literal("qualitaet"), value: z.enum(["auto", "niedrig", "mittel", "hoch"]) }),
  /** aktuellen Song in den Lieblingssongs speichern (true) oder entfernen (false) */
  z.object({ type: z.literal("merken"), on: z.boolean(), trackKey: z.string().max(200).optional() }),
]);
export type CommandInput = z.infer<typeof commandSchema>;
export type Command = CommandInput & { id: string; createdAt: number };

export function buildSnapshot(
  s: Pick<SongContextState, "song" | "playback" | "positionMs" | "derived" | "live">,
  light: LightFrame | null,
): Snapshot | null {
  const song = s.song;
  if (!song) return null;
  const year = Number(song.track.releaseDate?.slice(0, 4));
  const singer = song.artists.find((a) => a.spotifyId === s.derived.activeSingerId)?.name;
  return {
    trackKey: song.trackKey,
    title: song.track.title,
    artists: song.artists.map((a) => ({ name: a.name, role: a.role })),
    album: song.album.name,
    releaseYear: Number.isInteger(year) && year >= 1800 ? year : null,
    isPlaying: s.playback.isPlaying,
    positionMs: Math.round(s.positionMs),
    durationMs: song.track.durationMs,
    section: s.derived.section,
    activeSinger: singer ?? null,
    bpm: Math.round(s.live.bpm),
    palette: { dominant: song.album.palette.dominant, accent: song.album.palette.accent },
    light: light
      ? { scene: light.scene, base: light.signal.base, accent: light.signal.accent, brightness: light.signal.brightness }
      : null,
    updatedAt: Date.now(),
    ...extras(song),
  };
}

/**
 * Erster Satz eines Textes (für gesprochene Antworten), höchstens 300 Zeichen.
 * Kein Satzende nach Zahlen („3. Generation“, „12. März“), kurzen Abkürzungen („St.“, „z. B.“)
 * oder innerhalb von Klammern („(* 12. März 1970 in Wien)“).
 */
export function firstSentence(text: string): string {
  const t = text.trim();
  let depth = 0;
  let cut = t.length;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (".!?".includes(ch) && depth === 0 && /^(\s+[A-ZÄÖÜ„"]|\s*$)/.test(t.slice(i + 1))) {
      const word = /(\S+)$/.exec(t.slice(0, i))?.[1] ?? "";
      if (ch === "." && (/\d$/.test(word) || word.replace(/[^\p{L}]/gu, "").length < 3)) continue;
      cut = i + 1;
      break;
    }
  }
  const out = t.slice(0, cut).trim();
  return out.length > 300 ? `${out.slice(0, 297).trimEnd()}…` : out;
}

function extras(song: SongStatic): Pick<Snapshot, "user" | "concerts" | "about"> {
  const name = (id: string) => song.artists.find((a) => a.spotifyId === id)?.name;
  const out: Pick<Snapshot, "user" | "concerts" | "about"> = {};
  if (song.user) {
    const { trackSaved, lovedOnLastfm, trackPlays, artists } = song.user;
    out.user = {
      ...(trackSaved !== undefined ? { trackSaved } : {}),
      ...(lovedOnLastfm !== undefined ? { lovedOnLastfm } : {}),
      ...(trackPlays !== undefined ? { trackPlays } : {}),
      artists: Object.entries(artists ?? {}).flatMap(([id, a]) => {
        const n = name(id);
        return n ? [{ name: n, ...a }] : [];
      }),
    };
  }
  if (song.concerts?.length) {
    out.concerts = topConcerts(song)
      .all.slice(0, 5)
      .map((c) => ({
        artistName: c.artistName,
        date: c.date,
        city: c.city,
        venue: c.venue,
        ...(c.distanceKm !== undefined ? { distanceKm: c.distanceKm } : {}),
        ...(c.soldOut ? { soldOut: true } : {}),
      }));
  }
  if (song.info) {
    out.about = song.artists.flatMap((a) => {
      const i = song.info!.artists[a.spotifyId];
      if (!i) return [];
      return [
        { name: i.name ?? a.name, ...(i.summary ? { summary: firstSentence(i.summary) } : {}), facts: i.facts.slice(0, 4) },
      ];
    });
  }
  return out;
}
