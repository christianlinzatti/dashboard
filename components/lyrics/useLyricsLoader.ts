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

/** Abstände der Neuversuche nach vorübergehenden Fehlern (Netz weg, alle Provider im Timeout). */
export const RETRY_DELAYS_MS = [10_000, 30_000, 90_000];

/** true, wenn das Ergebnis nur wegen vorübergehender Fehler leer ist (dann später erneut versuchen). */
export function isTransientMiss(body: Pick<LyricsResponse, "lyrics" | "attempts" | "instrumental">) {
  return !body.lyrics && !body.instrumental && body.attempts.some((a) => a.outcome === "error" || a.outcome === "timeout");
}

/** Lädt bei jedem Songwechsel die Lyrics und reichert den Song-Kontext an (mit Neuversuchen). */
export function useLyricsLoader(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let ctrl: AbortController | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const retryLater = (song: SongStatic, attempt: number, detail: string) => {
      const delay = RETRY_DELAYS_MS[attempt];
      songContext.getState().mergeSong({
        status: {
          lyrics: {
            state: delay ? "error" : "missing",
            detail: delay ? `${detail} – neuer Versuch in ${delay / 1000} s` : detail,
          },
        },
      });
      if (delay) retryTimer = setTimeout(() => void load(song, attempt + 1), delay);
    };

    const load = async (song: SongStatic, attempt = 0) => {
      clearTimeout(retryTimer);
      if (songContext.getState().song?.trackKey !== song.trackKey) return;
      ctrl?.abort();
      ctrl = new AbortController();
      const { mergeSong } = songContext.getState();
      if (attempt === 0) mergeSong({ status: { lyrics: { state: "loading" } } });
      try {
        const res = await fetch(lyricsUrl(song), { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as LyricsResponse;
        if (songContext.getState().song?.trackKey !== song.trackKey) return;
        const tried = body.attempts.map((a) => `${a.provider}: ${a.outcome}`).join(", ");
        if (isTransientMiss(body)) return retryLater(song, attempt, `Lyrics-Quellen nicht erreichbar (${tried})`);
        mergeSong(
          body.lyrics
            ? {
                lyrics: body.lyrics,
                status: { lyrics: { state: "ok", provider: body.lyrics.provider, detail: tried, updatedAt: Date.now() } },
              }
            : {
                status: {
                  lyrics: { state: "missing", detail: body.instrumental ? "Instrumental" : `Keine Lyrics gefunden (${tried})` },
                },
              },
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (songContext.getState().song?.trackKey === song.trackKey) retryLater(song, attempt, "Lyrics-Dienst nicht erreichbar");
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
      clearTimeout(retryTimer);
      ctrl?.abort();
    };
  }, [enabled]);
}
