"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { LyricLine, SongStatic } from "@/lib/song-context/schema";
import { songContext, useSongContext } from "@/lib/song-context/store";

/**
 * Lyrics-Anzeige (Modus „Karaoke-Fill“): vorherige, aktive und nächste Zeile.
 * Weitere Modi und der LyricsDirector folgen in Meilenstein 3/6.
 */
export function LyricsLayer() {
  const song = useSongContext((s) => s.song);
  const lineIdx = useSongContext((s) => s.derived.lineIdx);
  const lineActive = useSongContext((s) => s.derived.lineActive);
  const wordIdx = useSongContext((s) => s.derived.wordIdx);
  const longGap = useSongContext((s) => (s.derived.secondsToNextLyric ?? 0) > 3);
  const beforeFirst = useSongContext((s) => s.derived.lineIdx < 0);

  const lines = song?.lyrics?.quality !== "plain" ? song?.lyrics?.lines : undefined;
  if (!song || !lines?.length) return <NoLyrics song={song} />;

  const current = lineActive ? lines[lineIdx] : undefined;
  const prev = lineActive ? lines[lineIdx - 1] : lines[lineIdx];
  const next = lines[lineIdx + 1];

  return (
    <section
      className="pointer-events-none absolute inset-x-0 bottom-[12vmin] flex flex-col items-center gap-[2vmin] px-[4vmin] text-center"
      data-testid="lyrics"
      aria-live="off"
    >
      <p className="min-h-[1.3em] text-[clamp(16px,3.6vmin,40px)] font-semibold text-white/35">{prev?.text ?? ""}</p>
      {current ? (
        <ActiveLine key={lineIdx} line={current} wordIdx={wordIdx} color={singerColor(song, current)} />
      ) : (
        <div className="flex min-h-[1.3em] items-center text-[clamp(30px,7.5vmin,96px)]" data-testid="lyrics-gap">
          {(longGap || beforeFirst) && <Dots />}
        </div>
      )}
      <p className="min-h-[1.3em] text-[clamp(16px,3.6vmin,40px)] font-semibold text-white/55">{next?.text ?? ""}</p>
    </section>
  );
}

function singerColor(song: SongStatic, line: LyricLine) {
  const id = line.agent ? song.lyrics?.singers?.[line.agent] : undefined;
  return song.artists.find((a) => a.spotifyId === id)?.color ?? song.album.palette.accent;
}

function ActiveLine({ line, wordIdx, color }: { line: LyricLine; wordIdx: number; color: string }) {
  const fillRef = useRef<HTMLSpanElement>(null);

  // Füllstand des aktuellen Worts (bzw. der Zeile) pro Frame direkt ins CSS schreiben
  useEffect(() => {
    const apply = (p: number) => fillRef.current?.style.setProperty("--p", String(p));
    apply(songContext.getState().derived.wordProgress);
    return songContext.subscribe((s) => s.derived.wordProgress, apply);
  }, [wordIdx]);

  const style = { "--c-singer": color } as CSSProperties;
  const cls = "lyric-glow text-[clamp(30px,7.5vmin,96px)] font-extrabold leading-[1.1] tracking-tight";

  if (!line.words?.length) {
    return (
      <p className={cls} style={style} data-testid="lyrics-current">
        <span ref={fillRef} className="word-fill">
          {line.text}
        </span>
      </p>
    );
  }

  return (
    <p className={cls} style={style} data-testid="lyrics-current">
      {line.words.map((w, i) => (
        <span key={i}>
          {i > 0 && " "}
          {i < wordIdx ? (
            <span style={{ color: "var(--c-singer)" }}>{w.text}</span>
          ) : i === wordIdx ? (
            <span ref={fillRef} className="word-fill">
              {w.text}
            </span>
          ) : (
            <span className="text-white/35">{w.text}</span>
          )}
        </span>
      ))}
    </p>
  );
}

function Dots() {
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

function NoLyrics({ song }: { song: SongStatic | null }) {
  const state = song?.status.lyrics?.state;
  // „idle“: Lyrics-Suche noch nicht gestartet – dann nichts anzeigen
  if (!song || state === "idle") return null;
  return (
    <section className="pointer-events-none absolute inset-x-0 bottom-[12vmin] text-center" data-testid="lyrics-none">
      <p className="text-[clamp(16px,3.4vmin,36px)] font-semibold text-white/50">
        {state === "loading"
          ? "Lyrics werden gesucht …"
          : state === "error"
            ? "Lyrics-Dienst gerade nicht erreichbar"
            : "Instrumental – keine Lyrics gefunden"}
      </p>
    </section>
  );
}
