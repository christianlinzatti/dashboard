"use client";

import { useEffect } from "react";
import type { Concert, SongStatic, Setlist } from "@/lib/song-context/schema";
import { songContext } from "@/lib/song-context/store";

const SEP = "\u001f";

export function concertsUrl(song: SongStatic) {
  return `/api/concerts?${new URLSearchParams({
    ids: song.artists.map((a) => a.spotifyId).join(SEP),
    names: song.artists.map((a) => a.name).join(SEP),
  })}`;
}

/** Lädt bevorstehende Konzerte und die letzte Setlist zu jedem neuen Song. */
export function useConcertLoader(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let ctrl: AbortController | undefined;
    const unsub = songContext.subscribe(
      (s) => s.song?.trackKey,
      async (key) => {
        const song = songContext.getState().song;
        if (!key || !song || song.concerts) return;
        ctrl?.abort();
        ctrl = new AbortController();
        try {
          const res = await fetch(concertsUrl(song), { signal: ctrl.signal });
          if (!res.ok) return;
          const { concerts, setlists } = (await res.json()) as { concerts: Concert[]; setlists: Record<string, Setlist> };
          if (songContext.getState().song?.trackKey === key)
            songContext.getState().mergeSong({ concerts, setlists, status: { concerts: { state: "ok" } } });
        } catch {
          /* Konzerte sind optional */
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
