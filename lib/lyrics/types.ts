import type { LyricLine, Section } from "@/lib/song-context/schema";

/** Was ein Provider zum Suchen bekommt (aus dem Song-Kontext). */
export type TrackQuery = {
  trackKey: string;
  spotifyId?: string;
  isrc?: string;
  title: string;
  artists: string[];
  /** Spotify-IDs in derselben Reihenfolge wie artists (für die Sänger-Zuordnung) */
  artistIds?: string[];
  album?: string;
  durationMs: number;
  /** Spotify-Token der Dashboard-Anmeldung (nur serverseitig, für Spotify Color-Lyrics) */
  userAccessToken?: string;
};

/** Rohes Ergebnis eines Providers, vor Normalisierung und Ranking. */
export type ProviderResult = {
  provider: string;
  sync: "word" | "line" | "plain";
  lines: LyricLine[];
  /** vom Provider gemeldete Songdauer – zum Abgleich mit Spotify */
  durationMs?: number;
  /** Provider sagt ausdrücklich: Instrumental, kein Text */
  instrumental?: boolean;
  singers?: Record<string, string>;
  /** Sprache der Umschrift/Übersetzung in den Zeilen */
  transliterationLang?: string;
  translationLang?: string;
  /** vom Provider gelieferte Songabschnitte (z. B. Apple-Music-TTML) statt eigener Erkennung */
  sections?: Section[];
};

/** Betriebszustand eines Providers (für /debug) */
export type ProviderStatus = {
  id: string;
  /** false = aus der Konfiguration genommen (z. B. kein Secret gesetzt) */
  configured: boolean;
  /** true = pausiert (Circuit-Breaker), antwortet solange nicht */
  paused: boolean;
  /** bis wann pausiert (Unix-ms) */
  pausedUntil?: number;
  /** Grund der letzten Pause */
  reason?: string;
};

export interface LyricsProvider {
  id: string;
  /** kleiner = bevorzugt bei gleicher Sync-Qualität */
  priority: number;
  /** true = Ergebnis gewinnt immer (eigene Korrekturen) */
  authoritative?: boolean;
  search(q: TrackQuery, signal: AbortSignal): Promise<ProviderResult | null>;
  /** Betriebszustand (nur Provider mit Circuit-Breaker o. Ä.) */
  status?(): ProviderStatus;
}
