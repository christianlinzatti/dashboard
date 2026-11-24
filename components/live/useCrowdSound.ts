"use client";

import { useEffect } from "react";
import { playApplause, playEncoreClapping } from "@/lib/live/crowd-sound";
import { settings } from "@/lib/settings";
import { eveningPhaseFor, setlistStore } from "@/lib/stage/setlist";
import { songContext } from "@/lib/song-context/store";

/** Applaus setzt so kurz vor Songende ein (Band winkt und verbeugt sich) */
export const APPLAUSE_BEFORE_END_MS = 4500;

/**
 * Publikumsgeräusche (Einstellung „Publikumsgeräusche“, Standard aus; nur live): Applaus zum Songende, rhythmisches
 * Klatschen zu Beginn einer Zugabe. Je Song höchstens einmal.
 */
export function useCrowdSound(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const applauded = new Set<string>();
    const encored = new Set<string>();
    return songContext.subscribe(
      (s) => Math.floor(s.positionMs / 250),
      () => {
        if (!settings.getState().crowdSound) return;
        const { song, positionMs, playback } = songContext.getState();
        if (!song || !playback.isPlaying) return;
        const left = song.track.durationMs - positionMs;
        if (left > 0 && left <= APPLAUSE_BEFORE_END_MS && !applauded.has(song.trackKey)) {
          applauded.add(song.trackKey);
          playApplause(6);
        }
        if (positionMs < 3000 && !encored.has(song.trackKey)) {
          encored.add(song.trackKey);
          const phase = eveningPhaseFor(setlistStore.getState().played, song.trackKey, song.music.mood);
          if (phase === "zugabe") playEncoreClapping(4);
        }
      },
    );
  }, [enabled]);
}
