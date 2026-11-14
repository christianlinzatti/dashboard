import { z } from "zod";

/**
 * Song-Kontext: der eine Ort mit allen Informationen zum aktuellen Song.
 * Quellen schreiben hinein, Anzeige- und Steuerungsmodule lesen nur daraus.
 * Siehe docs/KONZEPT.md, Abschnitt 4.1.
 */

export const SCHEMA_VERSION = 1 as const;

export const sourceNames = ["spotify", "lyrics", "music", "info", "palette"] as const;
export type SourceName = (typeof sourceNames)[number];

export const sourceStatusSchema = z.object({
  state: z.enum(["idle", "loading", "ok", "missing", "error"]),
  provider: z.string().optional(),
  detail: z.string().optional(),
  updatedAt: z.number().optional(),
});
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const imageSchema = z.object({
  url: z.string(),
  width: z.number().optional(),
  height: z.number().optional(),
});
export type Image = z.infer<typeof imageSchema>;

export const wordSchema = z.object({
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  text: z.string(),
});
export type LyricWord = z.infer<typeof wordSchema>;

export const lineSchema = z.object({
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  text: z.string(),
  agent: z.string().optional(),
  words: z.array(wordSchema).optional(),
});
export type LyricLine = z.infer<typeof lineSchema>;

export const sectionKinds = ["intro", "verse", "prechorus", "chorus", "bridge", "instrumental", "outro"] as const;
export type SectionKind = (typeof sectionKinds)[number];

export const sectionSchema = z.object({
  kind: z.enum(sectionKinds),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
});
export type Section = z.infer<typeof sectionSchema>;

export const lyricsSchema = z.object({
  provider: z.string(),
  quality: z.enum(["word", "word-estimated", "line", "plain"]),
  lines: z.array(lineSchema),
  sections: z.array(sectionSchema),
  /** Zuordnung Sänger-Kennung (z. B. TTML-Agent "v1") → Spotify-Artist-ID */
  singers: z.record(z.string(), z.string()).optional(),
});
export type Lyrics = z.infer<typeof lyricsSchema>;

export const artistSchema = z.object({
  spotifyId: z.string(),
  name: z.string(),
  role: z.enum(["main", "feature"]),
  mbid: z.string().optional(),
  genres: z.array(z.string()),
  images: z.array(imageSchema),
  avatarId: z.string(),
  color: z.string(),
});
export type Artist = z.infer<typeof artistSchema>;

export const paletteSchema = z.object({
  dominant: z.string(),
  accent: z.string(),
  dark: z.string(),
  light: z.string(),
});
export type Palette = z.infer<typeof paletteSchema>;

export const castMemberSchema = z.object({
  avatarId: z.string(),
  artistId: z.string().optional(),
  role: z.enum(["lead", "feature", "backup"]),
  position: z.number(),
});
export type CastMember = z.infer<typeof castMemberSchema>;

export const photoSchema = imageSchema.extend({
  credit: z.string(),
  license: z.string(),
  sourceUrl: z.string(),
});

export const infoSchema = z.object({
  artists: z.record(
    z.string(),
    z.object({ summary: z.string(), wikiUrl: z.string(), lang: z.enum(["de", "en"]), facts: z.array(z.string()) }),
  ),
  song: z.object({ summary: z.string(), wikiUrl: z.string() }).optional(),
  photos: z.array(photoSchema),
});

/** Stammdaten: einmal pro Song, serverseitig aggregiert und gecacht. */
export const songStaticSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  trackKey: z.string(),
  track: z.object({
    spotifyId: z.string(),
    isrc: z.string().optional(),
    title: z.string(),
    durationMs: z.number().positive(),
    explicit: z.boolean(),
    releaseDate: z.string().optional(),
    isFeature: z.boolean(),
  }),
  artists: z.array(artistSchema).min(1),
  album: z.object({ name: z.string(), coverUrl: z.string(), palette: paletteSchema }),
  lyrics: lyricsSchema.optional(),
  music: z.object({
    bpmHint: z.number().optional(),
    genres: z.array(z.string()),
    mood: z.enum(["ruhig", "mittel", "energetisch"]).optional(),
  }),
  info: infoSchema.optional(),
  cast: z.array(castMemberSchema),
  status: z.partialRecord(z.enum(sourceNames), sourceStatusSchema),
});
export type SongStatic = z.infer<typeof songStaticSchema>;

/** Wiedergabe: aus Spotify-Polling, Songzeit wird lokal interpoliert. */
export type Playback = {
  isPlaying: boolean;
  /** Songzeit zum Zeitpunkt `updatedAt` (performance.now()-Basis) */
  positionMs: number;
  updatedAt: number;
  /** Manuelle Verschiebung der Lyrics in ms (+ = Lyrics später) */
  offsetMs: number;
  device?: string;
  volume?: number;
};

/** Zustand der Mikrofon-Analyse. */
export type MicState = "aus" | "startet" | "aktiv" | "verweigert" | "nicht-verfuegbar" | "fehler";

/** Live-Analyse aus dem Mikrofon (pro Frame). */
export type Live = {
  /** Tempo für die Tanz-Planung (Startwert, nach Einrasten gemessen) */
  bpm: number;
  /** true, sobald das Tempo per Mikrofon stabil gemessen wurde */
  tempoLocked: boolean;
  /** aktuell gemessenes (noch ungefiltertes) Tempo */
  bpmMeasured: number;
  bpmConfidence: number;
  /** 0..1 innerhalb des aktuellen Schlags */
  beatPhase: number;
  beatCount: number;
  /** Songzeit (ms) eines Schlags – Raster für die Tanz-Synchronisation */
  gridAnchorMs: number | null;
  /** Songzeit (ms) des letzten erkannten Drops */
  lastDropMs: number | null;
  energy: number;
  /** Sub-Bass, Bass, Low-Mid, Mid, High, Air – jeweils 0..1 relativ */
  bands: number[];
  /** Stimm-Aktivität 0..1 */
  vocal: number;
  micActive: boolean;
  micState: MicState;
};

/** Aus Stammdaten + Songzeit abgeleitete Werte. */
export type Derived = {
  /** Index der zuletzt begonnenen Zeile (-1 = noch keine) */
  lineIdx: number;
  /** true, solange die Zeile gesungen wird (sonst Pause dazwischen) */
  lineActive: boolean;
  wordIdx: number;
  /** Fortschritt 0..1 innerhalb des aktuellen Worts */
  wordProgress: number;
  section: SectionKind | null;
  isChorus: boolean;
  activeSingerId?: string;
  /** Sekunden bis zur nächsten Lyric-Zeile (Instrumental-Countdown) */
  secondsToNextLyric: number | null;
};
