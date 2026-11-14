"use client";

import { useEffect } from "react";
import type { SongStatic, UserInfo } from "@/lib/song-context/schema";
import { songContext } from "@/lib/song-context/store";

const SEP = "\u001f";

export function personalUrl(song: SongStatic) {
  return `/api/personal?${new URLSearchParams({
    trackId: song.track.spotifyId,
    title: song.track.title,
    ids: song.artists.map((a) => a.spotifyId).join(SEP),
    names: song.artists.map((a) => a.name).join(SEP),
  })}`;
}

/** Lädt Likes, Follows und Hörstatistik zu jedem neuen Song. */
export function useUserLoader(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let ctrl: AbortController | undefined;
    const unsub = songContext.subscribe(
      (s) => s.song?.trackKey,
      async (key) => {
        const song = songContext.getState().song;
        if (!key || !song || song.user) return;
        ctrl?.abort();
        ctrl = new AbortController();
        try {
          const res = await fetch(personalUrl(song), { signal: ctrl.signal });
          if (!res.ok) return;
          const { user } = (await res.json()) as { user: UserInfo };
          if (songContext.getState().song?.trackKey === key)
            songContext.getState().mergeSong({ user, status: { user: { state: "ok" } } });
        } catch {
          /* Persönliches ist optional */
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
