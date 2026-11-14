"use client";

import { useEffect } from "react";
import { songContext } from "@/lib/song-context/store";
import type { SongStatic } from "@/lib/song-context/schema";
import type { LyricsResponse } from "@/lib/lyrics/service";

/** Trennzeichen für mehrere Artists in der URL (kommt in Namen nicht vor). */
const SEP = "\u001f";

export function lyricsUrl(song: SongStatic) {
  const p = new URLSearchParams({
    trackKey: song.trackKey,
    spotifyId: song.track.spotifyId,
    title: song.track.title,
    artists: song.artists.map((a) => a.name).join(SEP),
    album: song.album.name,
    durationMs: String(song.track.durationMs),
    ...(song.track.isrc ? { isrc: song.track.isrc } : {}),
  });
  return `/api/lyrics?${p}`;
}

/** Lädt bei jedem Songwechsel die Lyrics und reichert den Song-Kontext an. */
export function useLyricsLoader(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let ctrl: AbortController | undefined;

    const load = async (song: SongStatic) => {
      ctrl?.abort();
      ctrl = new AbortController();
      const { mergeSong } = songContext.getState();
      mergeSong({ status: { lyrics: { state: "loading" } } });
      try {
        const res = await fetch(lyricsUrl(song), { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as LyricsResponse;
        if (songContext.getState().song?.trackKey !== song.trackKey) return;
        const tried = body.attempts.map((a) => `${a.provider}: ${a.outcome}`).join(", ");
        mergeSong(
          body.lyrics
            ? { lyrics: body.lyrics, status: { lyrics: { state: "ok", provider: body.lyrics.provider, detail: tried, updatedAt: Date.now() } } }
            : {
                status: {
                  lyrics: { state: "missing", detail: body.instrumental ? "Instrumental" : `Keine Lyrics gefunden (${tried})` },
                },
              },
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (songContext.getState().song?.trackKey === song.trackKey) {
          mergeSong({ status: { lyrics: { state: "error", detail: "Lyrics-Dienst nicht erreichbar" } } });
        }
      }
    };

    const unsub = songContext.subscribe(
      (s) => s.song?.trackKey,
      (key) => {
        const song = songContext.getState().song;
        if (key && song && !song.lyrics && song.status.lyrics?.state === "idle") void load(song);
      },
      { fireImmediately: true },
    );
    return () => {
      unsub();
      ctrl?.abort();
    };
  }, [enabled]);
}
