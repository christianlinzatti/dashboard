import { positionAt } from "@/lib/song-context/derive";
import type { SongContextStore } from "@/lib/song-context/store";
import { measuredPosition, reconcilePosition } from "./clock";
import { songFromTrack, trackKeyOf } from "./map";
import type { NowPlaying } from "./types";

/**
 * Überträgt eine /api/now-playing-Antwort in den Song-Kontext.
 * Gibt zurück, ob ein neuer Song begonnen hat (für Palette & spätere Anreicherung).
 */
export function applyNowPlaying(store: SongContextStore, np: NowPlaying, rttMs: number, now: number): { newTrack: boolean } {
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
    // Tagesform: derselbe Song bekommt jeden Tag eine etwas andere Show
    s.setSong({ ...songFromTrack(np.track), variant: new Date(now).toISOString().slice(0, 10) });
    s.setPlayback({ isPlaying, positionMs: measured, updatedAt: now, ...device });
    return { newTrack: true };
  }

  const predicted = positionAt(s.playback, now, s.song.track.durationMs);
  const positionMs = isPlaying === s.playback.isPlaying ? reconcilePosition(predicted, measured) : measured;
  s.setPlayback({ isPlaying, positionMs, updatedAt: now, ...device });
  return { newTrack: false };
}
