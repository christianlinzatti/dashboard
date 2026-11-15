"use client";

import { useEffect, useRef } from "react";
import type { LyricLine, SongStatic } from "@/lib/song-context/schema";
import { songContext } from "@/lib/song-context/store";

/** Gemeinsame Bausteine der Lyrics-Darstellungen. */

export const BIG = "lyric-glow text-[clamp(30px,7.5vmin,96px)] font-extrabold leading-[1.1] tracking-tight";

export type ModeProps = { line: LyricLine; wordIdx: number; color: string };

export function singerColor(song: SongStatic, line: LyricLine) {
  const id = line.agent ? song.lyrics?.singers?.[line.agent] : undefined;
  return song.artists.find((a) => a.spotifyId === id)?.color ?? song.album.palette.accent;
}

export function Context({ text, dim }: { text?: string; dim?: boolean }) {
  return (
    <p className={`min-h-[1.3em] text-[clamp(16px,3.6vmin,40px)] font-semibold ${dim ? "text-white/35" : "text-white/55"}`}>
      {text ?? ""}
    </p>
  );
}

/** Füllstand des aktuellen Worts pro Frame direkt ins CSS schreiben (ohne React-Rerender). */
export function useFill(wordIdx: number) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const apply = (p: number) => ref.current?.style.setProperty("--p", String(p));
    apply(songContext.getState().derived.wordProgress);
    return songContext.subscribe((s) => s.derived.wordProgress, apply);
  }, [wordIdx]);
  return ref;
}

export function Dots() {
  return (
    <span className="flex gap-[0.4em]" aria-label="Instrumental">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block size-[0.3em] rounded-full"
          style={{ background: "var(--c-accent)", animation: `dot 1.2s ${i * 0.2}s infinite ease-in-out` }}
        />
      ))}
    </span>
  );
}
