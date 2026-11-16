"use client";

import { useEffect } from "react";
import type { ShowBrief, Mood } from "@/lib/show/brief";
import type { SongStatic } from "@/lib/song-context/schema";
import { songContext } from "@/lib/song-context/store";

const SEP = "\u001f";
/** Auf die Lyrics warten (die Regie liest Aufbau und Text aus dem Cache) – aber nicht ewig */
const LYRICS_WAIT_MS = 6000;
/** Danach wird nichts mehr umgestellt: ein Bühnen- oder Tanzwechsel mitten im Song stört. Das Ergebnis liegt dann im Cache fürs nächste Mal. */
export const APPLY_UNTIL_MS = 25_000;

export type ShowPayload = {
  genres: string[];
  mood?: Mood;
  brief: ShowBrief | null;
  source: { tags: string; brief: string | null };
};

export function showUrl(song: SongStatic) {
  const year = Number(song.track.releaseDate?.slice(0, 4));
  const p = new URLSearchParams({
    track: song.trackKey,
    title: song.track.title,
    artists: song.artists.map((a) => a.name).join(SEP),
    album: song.album.name,
    durationMs: String(Math.round(song.track.durationMs)),
    ...(Number.isInteger(year) && year >= 1800 ? { year: String(year) } : {}),
  });
  return `/api/show?${p}`;
}

/** Was aus der Antwort in den Song-Kontext kommt (rein, für Tests). `early` = Song hat gerade erst begonnen. */
export function showPatch(song: SongStatic, r: ShowPayload, early: boolean): Partial<SongStatic> {
  if (!early)
    return {
      status: {
        ...song.status,
        show: { state: "ok", provider: r.source.brief ?? "regeln", detail: "erst beim nächsten Abspielen" },
      },
    };
  const genres = song.music.genres.length ? song.music.genres : r.genres;
  return {
    music: { ...song.music, genres, mood: song.music.mood ?? r.mood },
    ...(r.brief ? { show: r.brief } : {}),
    status: {
      ...song.status,
      music: { state: genres.length ? "ok" : "missing", provider: song.music.genres.length ? "spotify" : "theaudiodb/last.fm" },
      show: { state: r.brief ? "ok" : "missing", provider: r.source.brief ?? "regeln" },
    },
  };
}

/**
 * Lädt nach jedem Songwechsel die Regie: Genres und Stimmung aus offenen Quellen und – wenn eingerichtet –
 * die Regieanweisung der KI. Startet, sobald die Lyrics-Suche fertig ist (oder nach 6 s).
 */
export function useShowLoader(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let ctrl: AbortController | undefined;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let loadedFor: string | undefined;

    const load = async (trackKey: string) => {
      const song = songContext.getState().song;
      if (!song || song.trackKey !== trackKey || loadedFor === trackKey) return;
      loadedFor = trackKey;
      ctrl?.abort();
      ctrl = new AbortController();
      songContext.getState().mergeSong({ status: { ...song.status, show: { state: "loading" } } });
      try {
        const res = await fetch(showUrl(song), { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const payload = (await res.json()) as ShowPayload;
        const s = songContext.getState();
        if (s.song?.trackKey !== trackKey) return;
        s.mergeSong(showPatch(s.song, payload, s.positionMs < APPLY_UNTIL_MS || !s.playback.isPlaying));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        const s = songContext.getState();
        if (s.song?.trackKey === trackKey)
          s.mergeSong({ status: { ...s.song.status, show: { state: "error", detail: "Regie nicht erreichbar" } } });
      }
    };

    const unsub = songContext.subscribe(
      (s) => `${s.song?.trackKey ?? ""}|${["ok", "missing", "error"].includes(s.song?.status.lyrics?.state ?? "")}`,
      (key) => {
        const [trackKey, settled] = key.split("|");
        clearTimeout(wait);
        if (!trackKey || loadedFor === trackKey) return;
        if (settled === "true") void load(trackKey);
        else wait = setTimeout(() => void load(trackKey), LYRICS_WAIT_MS);
      },
      { fireImmediately: true },
    );
    return () => {
      unsub();
      clearTimeout(wait);
      ctrl?.abort();
    };
  }, [enabled]);
}
