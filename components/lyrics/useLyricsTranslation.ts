"use client";

import { useEffect } from "react";
import { applyGermanTranslation } from "@/lib/lyrics/apply-translation";
import { needsGermanTranslation } from "@/lib/lyrics/second-line";
import { songContext } from "@/lib/song-context/store";

/**
 * Deutsche Übersetzung per KI für Songs, die nicht deutsch sind (nur live): sobald die Lyrics da sind, einmal je Song
 * fragen – der Server übersetzt beim ersten Mal und hat es danach im Cache.
 */
export function useLyricsTranslation(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let ctrl: AbortController | undefined;
    let askedFor: string | undefined;
    const unsub = songContext.subscribe(
      (s) => `${s.song?.trackKey ?? ""}|${s.song?.status.lyrics?.state ?? ""}`,
      async () => {
        const song = songContext.getState().song;
        if (!song?.lyrics || song.status.lyrics?.state !== "ok" || askedFor === song.trackKey) return;
        if (!needsGermanTranslation(song.lyrics)) return;
        askedFor = song.trackKey;
        ctrl?.abort();
        ctrl = new AbortController();
        try {
          const res = await fetch(`/api/lyrics/translate?${new URLSearchParams({ track: song.trackKey })}`, {
            signal: ctrl.signal,
          });
          if (!res.ok) return;
          const body = (await res.json()) as { status: string; byText?: Record<string, string> };
          const now = songContext.getState().song;
          if (body.status !== "ok" || !body.byText || now?.trackKey !== song.trackKey || !now.lyrics) return;
          songContext.getState().mergeSong({ lyrics: applyGermanTranslation(now.lyrics, body.byText) });
        } catch {
          /* Übersetzung ist optional */
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
