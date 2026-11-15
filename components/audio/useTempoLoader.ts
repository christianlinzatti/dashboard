"use client";

import { useEffect } from "react";
import { songContext } from "@/lib/song-context/store";

/**
 * Lädt zu jedem neuen Song einen Tempo-Startwert (Deezer über die ISRC). Tanz und Licht nutzen ihn,
 * bis das Mikrofon das Tempo selbst sicher erkannt hat; ohne Mikrofon bleibt er das Tempo des Songs.
 */
export function useTempoLoader(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let ctrl: AbortController | undefined;
    const unsub = songContext.subscribe(
      (s) => s.song?.trackKey,
      async (key) => {
        const song = songContext.getState().song;
        if (!key || !song?.track.isrc || song.music.bpmHint) return;
        ctrl?.abort();
        ctrl = new AbortController();
        try {
          const q = new URLSearchParams({ isrc: song.track.isrc, durationMs: String(song.track.durationMs) });
          const res = await fetch(`/api/tempo?${q}`, { signal: ctrl.signal });
          if (!res.ok) return;
          const { bpm } = (await res.json()) as { bpm: number | null };
          const s = songContext.getState();
          if (!bpm || s.song?.trackKey !== key) return;
          s.mergeSong({ music: { ...s.song.music, bpmHint: bpm } });
          if (!s.live.tempoLocked) s.setLive({ bpm });
        } catch {
          /* Startwert ist optional */
        }
      },
      { fireImmediately: true },
    );
    return () => {
      unsub();
      ctrl?.abort();
    };
  }, [enabled]);
}
