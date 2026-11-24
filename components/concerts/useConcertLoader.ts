"use client";

import { useEffect } from "react";
import { failureMessages } from "@/lib/concerts/debug";
import { report } from "@/lib/live/telemetry";
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
          const {
            concerts,
            setlists,
            area,
            sources = [],
          } = (await res.json()) as {
            concerts: Concert[];
            setlists: Record<string, Setlist>;
            area?: { name: string; radiusKm: number };
            sources?: Array<{ artist: string; provider: string; state: string; error?: string; cached?: boolean }>;
          };
          // ausgefallene Quellen ins Kiosk-Protokoll (/debug) – nur bei frischer Abfrage, nicht bei jedem Treffer im Cache
          const failures = failureMessages(sources.filter((x) => !x.cached));
          for (const m of failures) report("warnung", "konzerte", m);
          const detail = failureMessages(sources).join(" · ");
          if (songContext.getState().song?.trackKey === key)
            songContext.getState().mergeSong({
              concerts,
              setlists,
              ...(area ? { concertArea: area } : {}),
              status: { concerts: { state: "ok", ...(detail ? { detail: `Quelle fehlt: ${detail}` } : {}) } },
            });
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
