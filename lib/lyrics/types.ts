import type { LyricLine } from "@/lib/song-context/schema";

/** Was ein Provider zum Suchen bekommt (aus dem Song-Kontext). */
export type TrackQuery = {
  trackKey: string;
  spotifyId?: string;
  isrc?: string;
  title: string;
  artists: string[];
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
};

export interface LyricsProvider {
  id: string;
  /** kleiner = bevorzugt bei gleicher Sync-Qualität */
  priority: number;
  /** true = Ergebnis gewinnt immer (eigene Korrekturen) */
  authoritative?: boolean;
  search(q: TrackQuery, signal: AbortSignal): Promise<ProviderResult | null>;
}
