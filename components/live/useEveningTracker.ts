"use client";

import { useEffect } from "react";
import { songContext, useSongContext } from "@/lib/song-context/store";
import { eveningPhaseFor, setlistStore } from "@/lib/stage/setlist";
import { transitionStore } from "@/lib/show/transition";
import { recapStore } from "@/lib/show/recap";

/** So kurz vor Songende gilt ein Song als ausgespielt (Outro, Abgang) */
export const FINISH_MARGIN_MS = 15_000;

/**
 * Zeichnet den Abend auf: je Song Stimmung, Like und Phase, und ob er (fast) bis zum Ende lief. Läuft im Dashboard,
 * unabhängig von der 3D-Bühne – Zugabe und Spannungsbogen funktionieren auch ohne WebGL oder während die Szene lädt.
 */
export function useEveningTracker() {
  const trackKey = useSongContext((s) => s.song?.trackKey);
  const mood = useSongContext((s) => s.song?.show?.mood ?? s.song?.music.mood);
  const liked = useSongContext((s) => !!(s.song?.user?.trackSaved || s.song?.user?.lovedOnLastfm));

  // Rückblick: Protokoll des Abends aus dem Browser laden (überlebt einen Neustart des Kiosks)
  useEffect(() => recapStore.getState().hydrate(), []);

  useEffect(() => {
    if (!trackKey) return;
    const { played, record } = setlistStore.getState();
    const phase = eveningPhaseFor(played, trackKey, mood);
    record({ trackKey, mood, liked, phase });
    const song = songContext.getState().song;
    // nur echte Wiedergabe (keine Demos, keine eingefrorenen Screenshots) kommt in den Rückblick
    if (song?.trackKey === trackKey && !songContext.getState().frozen && !trackKey.startsWith("demo-")) {
      recapStore.getState().start({
        trackKey,
        title: song.track.title,
        artist: song.artists[0]?.name ?? "",
        coverUrl: song.album.coverUrl || undefined,
        durationMs: song.track.durationMs,
        at: Date.now(),
      });
      recapStore.getState().update(trackKey, { phase, liked });
    }
  }, [trackKey, mood, liked]);

  useEffect(() => {
    // letzter Song (auch über eine Pause/Stille hinweg) – beim nächsten beginnt der Umbau bzw. die Zugabe
    let last = songContext.getState().song?.trackKey ?? null;
    return songContext.subscribe((s) => {
      const song = s.song;
      if (!song) return;
      if (song.trackKey !== last) {
        if (last) {
          const zugabe = eveningPhaseFor(setlistStore.getState().played, song.trackKey, undefined) === "zugabe";
          transitionStore.getState().start(song.trackKey, zugabe ? "zugabe" : "umbau");
        }
        last = song.trackKey;
      }
      if (s.positionMs >= song.track.durationMs - FINISH_MARGIN_MS) {
        setlistStore.getState().finish(song.trackKey);
        if (!s.frozen && !song.trackKey.startsWith("demo-")) recapStore.getState().update(song.trackKey, { finished: true });
      }
    });
  }, []);
}
