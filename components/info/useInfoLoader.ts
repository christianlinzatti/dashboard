"use client";

import { useEffect } from "react";
import type { Info, SongStatic } from "@/lib/song-context/schema";
import { songContext } from "@/lib/song-context/store";

const SEP = "\u001f";
const RETRY_MS = 60_000;

export function infoUrl(song: SongStatic) {
  const p = new URLSearchParams({
    ids: song.artists.map((a) => a.spotifyId).join(SEP),
    names: song.artists.map((a) => a.name).join(SEP),
  });
  return `/api/info?${p}`;
}

/** Lädt Band-Infos und Fotos nach jedem Songwechsel (nach den Lyrics, mit einem Neuversuch). */
export function useInfoLoader(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let ctrl: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const load = async (song: SongStatic, attempt = 0) => {
      if (songContext.getState().song?.trackKey !== song.trackKey) return;
      ctrl?.abort();
      ctrl = new AbortController();
      const { mergeSong } = songContext.getState();
      if (attempt === 0) mergeSong({ status: { info: { state: "loading" } } });
      try {
        const res = await fetch(infoUrl(song), { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const { info, complete } = (await res.json()) as { info: Info; complete: boolean };
        if (songContext.getState().song?.trackKey !== song.trackKey) return;
        const found = Object.keys(info.artists).length > 0;
        mergeSong({ ...(found ? { info } : {}), status: { info: { state: found ? "ok" : "missing", provider: "wikipedia" } } });
        if (!complete && attempt === 0) retry = setTimeout(() => void load(song, 1), RETRY_MS);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        mergeSong({ status: { info: { state: "error", detail: "Info-Dienst nicht erreichbar" } } });
        if (attempt === 0) retry = setTimeout(() => void load(song, 1), RETRY_MS);
      }
    };

    const unsub = songContext.subscribe(
      (s) => s.song?.trackKey,
      (key) => {
        clearTimeout(retry);
        const song = songContext.getState().song;
        if (key && song && !song.info && song.status.info?.state === "idle") void load(song);
      },
      { fireImmediately: true },
    );
    return () => {
      unsub();
      clearTimeout(retry);
      ctrl?.abort();
    };
  }, [enabled]);
}
