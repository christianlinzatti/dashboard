import { positionAt } from "@/lib/song-context/derive";
import type { SongContextStore } from "@/lib/song-context/store";
import { measuredPosition, reconcilePosition } from "./clock";
import { songFromTrack, trackKeyOf } from "./map";
import type { NowPlaying } from "./types";

/** Kalendertag in Ortszeit als JJJJ-MM-TT (Tagesform wechselt um Mitternacht, nicht um 1 Uhr UTC) */
export function localDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Überträgt eine /api/now-playing-Antwort in den Song-Kontext.
 * Gibt zurück, ob ein neuer Song begonnen hat (für Palette & spätere Anreicherung).
 */
export function applyNowPlaying(
  store: SongContextStore,
  np: NowPlaying,
  rttMs: number,
  now: number,
  today: number = Date.now(),
): { newTrack: boolean } {
  const s = store.getState();
  if (np.state === "idle" || np.state === "unsupported") {
    if (s.song) s.setSong(null);
    s.setPlayback({ isPlaying: false });
    return { newTrack: false };
  }

  const isPlaying = np.state === "playing";
  const measured = isPlaying ? measuredPosition(np.progressMs, rttMs) : np.progressMs;
  const device = { device: np.device, volume: np.volume };

  if (s.song?.trackKey !== trackKeyOf(np.track)) {
    // Tagesform: derselbe Song bekommt jeden Tag eine etwas andere Show. `now` ist die Messuhr (performance.now(),
    // zählt ab Seitenstart) – fürs Datum zählt die echte Uhr, sonst stünde hier immer 1970-01-01.
    s.setSong({ ...songFromTrack(np.track), variant: localDay(today) });
    s.setPlayback({ isPlaying, positionMs: measured, updatedAt: now, ...device });
    return { newTrack: true };
  }

  const predicted = positionAt(s.playback, now, s.song.track.durationMs);
  const positionMs = isPlaying === s.playback.isPlaying ? reconcilePosition(predicted, measured) : measured;
  s.setPlayback({ isPlaying, positionMs, updatedAt: now, ...device });
  return { newTrack: false };
}
