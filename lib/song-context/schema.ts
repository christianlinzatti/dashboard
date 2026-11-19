import { z } from "zod";
import { storedBriefSchema } from "@/lib/show/brief";
import { memorySchema } from "@/lib/song-memory/memory";

/**
 * Song-Kontext: der eine Ort mit allen Informationen zum aktuellen Song.
 * Quellen schreiben hinein, Anzeige- und Steuerungsmodule lesen nur daraus.
 * Siehe docs/KONZEPT.md, Abschnitt 4.1.
 */

export const SCHEMA_VERSION = 1 as const;

export const sourceNames = ["spotify", "lyrics", "music", "info", "palette", "user", "concerts", "show"] as const;
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

export const syllableSchema = z.object({
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  text: z.string(),
});
export type LyricSyllable = z.infer<typeof syllableSchema>;

export const wordSchema = z.object({
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  text: z.string(),
  /** Silben mit eigenem Timing (z. B. „e|nough“) – die Füllung folgt dann Silbe für Silbe */
  syllables: z.array(syllableSchema).optional(),
});
export type LyricWord = z.infer<typeof wordSchema>;

export const lineSchema = z.object({
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  text: z.string(),
  agent: z.string().optional(),
  words: z.array(wordSchema).optional(),
  /** Umschrift in lateinischer Schrift (z. B. Rōmaji), mit eigenem Wort-Timing, falls vorhanden */
  transliteration: z.object({ text: z.string(), words: z.array(wordSchema).optional() }).optional(),
  /** Übersetzung der Zeile (Text, ohne Timing) */
  translation: z.string().optional(),
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
  /** Sprache der Umschrift (z. B. „ja-Latn“) und der Übersetzung (z. B. „en-US“) */
  transliterationLang: z.string().optional(),
  translationLang: z.string().optional(),
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
  /** Outfit (lib/avatars/outfits.ts) und Farbe der Leuchtstreifen; ohne Angabe das Original des Modells */
  outfit: z.string().optional(),
  trim: z.string().optional(),
});
export type CastMember = z.infer<typeof castMemberSchema>;

export const photoSchema = imageSchema.extend({
  /** zu welchem Artist das Foto gehört (Spotify-ID) */
  artistId: z.string().optional(),
  credit: z.string(),
  license: z.string(),
  sourceUrl: z.string(),
  /** Herkunft (für Ranking und Quellenangabe) */
  source: z.enum(["commons", "theaudiodb", "flickr", "demo"]).optional(),
  /** photo = Foto, fanart = Bühnenbild 16:9 ohne Text, thumb = Porträt/quadratisch */
  kind: z.enum(["photo", "fanart", "thumb"]).optional(),
});

export type Photo = z.infer<typeof photoSchema>;

export const infoSchema = z.object({
  artists: z.record(
    z.string(),
    z.object({
      name: z.string().optional(),
      summary: z.string(),
      wikiUrl: z.string(),
      lang: z.enum(["de", "en"]),
      facts: z.array(z.string()),
      /** Herkunft des Textes (Standard: Wikipedia) */
      textSource: z.enum(["wikipedia", "theaudiodb"]).optional(),
      /** Schriftzug (transparentes PNG, TheAudioDB) */
      logo: z.string().optional(),
    }),
  ),
  /** Song-Trivia (Genius): Produzenten, Songwriter, Samples */
  song: z.object({ trivia: z.array(z.string()), url: z.string().optional() }).optional(),
  photos: z.array(photoSchema),
});

export type Info = z.infer<typeof infoSchema>;

/** Persönliches (Stufe 5): Likes, Follows, Hörstatistik. Unbekannte Werte fehlen. */
export const userSchema = z.object({
  /** Song in den Spotify-Lieblingssongs */
  trackSaved: z.boolean().optional(),
  /** Song auf Last.fm „geliebt“ */
  lovedOnLastfm: z.boolean().optional(),
  /** wie oft gehört (Last.fm) */
  trackPlays: z.number().int().nonnegative().optional(),
  artists: z.record(
    z.string(),
    z.object({ following: z.boolean().optional(), plays: z.number().int().nonnegative().optional() }),
  ),
});
export type UserInfo = z.infer<typeof userSchema>;

/** Bevorstehendes Konzert (Stufe 5b), aus mehreren Quellen zusammengeführt. */
export const concertSchema = z.object({
  artistId: z.string(),
  artistName: z.string(),
  /** Datum JJJJ-MM-TT (Ortszeit) */
  date: z.string(),
  time: z.string().optional(),
  venue: z.string(),
  city: z.string(),
  country: z.string().optional(),
  distanceKm: z.number().optional(),
  ticketUrl: z.string().optional(),
  soldOut: z.boolean().optional(),
  /** Entfernung aus OpenStreetMap-Ortsdaten berechnet */
  geocoded: z.boolean().optional(),
  providers: z.array(z.string()),
});
export type Concert = z.infer<typeof concertSchema>;

/** Zuletzt live gespielte Songs eines Artists (setlist.fm). */
export const setlistSchema = z.object({
  date: z.string(),
  city: z.string().optional(),
  tour: z.string().optional(),
  songs: z.array(z.string()),
});
export type Setlist = z.infer<typeof setlistSchema>;

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
  /** Regieanweisung der KI für diesen Song (lib/show) */
  show: storedBriefSchema.optional(),
  /** Song-Gedächtnis: früher per Mikrofon gemessene Drops und Tempo (lib/song-memory) */
  memory: memorySchema.optional(),
  /** Tagesform: gleiche Regeln, anderer Zufall – derselbe Song sieht jeden Tag etwas anders aus (nur Live-Betrieb) */
  variant: z.string().optional(),
  info: infoSchema.optional(),
  user: userSchema.optional(),
  concerts: z.array(concertSchema).optional(),
  setlists: z.record(z.string(), setlistSchema).optional(),
  /** Bereich, für den „in deiner Nähe“ gilt (Heimatort und Umkreis) */
  concertArea: z.object({ name: z.string(), radiusKm: z.number().positive() }).optional(),
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
