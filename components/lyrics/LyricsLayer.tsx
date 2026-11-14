"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { markBackground, planLyricsModes, type LyricsMode } from "@/lib/lyrics/director";
import type { LyricLine, SongStatic } from "@/lib/song-context/schema";
import { songContext, useSongContext } from "@/lib/song-context/store";

/**
 * Lyrics-Anzeige. Der LyricsDirector wählt pro Abschnitt eine Darstellung
 * (Karaoke, Wort-Pop, Stapel, Schreibmaschine, Duett); mit `forceMode` fest (Tests/Screenshots).
 */
export function LyricsLayer({ forceMode }: { forceMode?: LyricsMode }) {
  const song = useSongContext((s) => s.song);
  const lineIdx = useSongContext((s) => s.derived.lineIdx);
  const lineActive = useSongContext((s) => s.derived.lineActive);
  const wordIdx = useSongContext((s) => s.derived.wordIdx);
  const longGap = useSongContext((s) => (s.derived.secondsToNextLyric ?? 0) > 3);
  const beforeFirst = useSongContext((s) => s.derived.lineIdx < 0);

  const sectionsKey = song?.lyrics?.sections.map((s) => s.startMs).join() ?? "";
  const modes = useMemo(
    () => (song ? planLyricsModes(song) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei inhaltlicher Änderung neu planen
    [song?.trackKey, song?.lyrics?.provider, sectionsKey],
  );

  const lines = song?.lyrics?.quality !== "plain" ? song?.lyrics?.lines : undefined;
  if (!song || !lines?.length) return <NoLyrics song={song} />;

  const current = lineActive ? lines[lineIdx] : undefined;
  const mode: LyricsMode = forceMode ?? modes[lineActive ? lineIdx : lineIdx + 1] ?? "karaoke";
  const prev = lineActive ? lines[lineIdx - 1] : lines[lineIdx];
  const next = lines[lineIdx + 1];
  const color = (l?: LyricLine) => (l ? singerColor(song, l) : song.album.palette.accent);

  const gap = (
    <div className="flex min-h-[1.3em] items-center justify-center text-[clamp(30px,7.5vmin,96px)]" data-testid="lyrics-gap">
      {(longGap || beforeFirst) && <Dots />}
    </div>
  );

  return (
    <section
      key={mode}
      className="lyrics-mode pointer-events-none absolute inset-x-0 bottom-[12vmin] flex flex-col items-center gap-[2vmin] px-[4vmin] text-center"
      data-testid="lyrics"
      data-mode={mode}
      aria-live="off"
    >
      {mode === "duett" ? (
        <Duet song={song} lines={lines} lineIdx={lineIdx} current={current} wordIdx={wordIdx} gap={gap} />
      ) : (
        <>
          {mode === "karaoke" || mode === "schreibmaschine" ? (
            <Context text={prev?.text} dim />
          ) : (
            <Context text={undefined} dim />
          )}
          {!current ? (
            gap
          ) : mode === "wortpop" ? (
            <WordPop key={lineIdx} line={current} wordIdx={wordIdx} color={color(current)} />
          ) : mode === "stapel" ? (
            <Stack key={lineIdx} line={current} wordIdx={wordIdx} color={color(current)} />
          ) : mode === "schreibmaschine" ? (
            <Typewriter key={lineIdx} line={current} wordIdx={wordIdx} color={color(current)} />
          ) : (
            <Karaoke key={lineIdx} line={current} wordIdx={wordIdx} color={color(current)} />
          )}
          <Context text={next?.text} />
        </>
      )}
    </section>
  );
}

function singerColor(song: SongStatic, line: LyricLine) {
  const id = line.agent ? song.lyrics?.singers?.[line.agent] : undefined;
  return song.artists.find((a) => a.spotifyId === id)?.color ?? song.album.palette.accent;
}

function Context({ text, dim }: { text?: string; dim?: boolean }) {
  return (
    <p className={`min-h-[1.3em] text-[clamp(16px,3.6vmin,40px)] font-semibold ${dim ? "text-white/35" : "text-white/55"}`}>
      {text ?? ""}
    </p>
  );
}

/** Füllstand des aktuellen Worts pro Frame direkt ins CSS schreiben (ohne React-Rerender). */
function useFill(wordIdx: number) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const apply = (p: number) => ref.current?.style.setProperty("--p", String(p));
    apply(songContext.getState().derived.wordProgress);
    return songContext.subscribe((s) => s.derived.wordProgress, apply);
  }, [wordIdx]);
  return ref;
}

const BIG = "lyric-glow text-[clamp(30px,7.5vmin,96px)] font-extrabold leading-[1.1] tracking-tight";

type ModeProps = { line: LyricLine; wordIdx: number; color: string };

/** Karaoke: ganze Zeile, Wörter füllen sich nacheinander. */
function Karaoke({ line, wordIdx, color }: ModeProps) {
  const fill = useFill(wordIdx);
  const style = { "--c-singer": color } as CSSProperties;
  if (!line.words?.length) {
    return (
      <p className={BIG} style={style} data-testid="lyrics-current">
        <span ref={fill} className="word-fill">
          {line.text}
        </span>
      </p>
    );
  }
  return (
    <p className={BIG} style={style} data-testid="lyrics-current">
      {markBackground(line.words).map((w, i) => (
        <span key={i} className={w.bg ? "text-[0.6em] font-semibold italic" : undefined}>
          {i > 0 && " "}
          {i < wordIdx ? (
            <span style={{ color: "var(--c-singer)" }}>{w.text}</span>
          ) : i === wordIdx ? (
            <span ref={fill} className="word-fill">
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

/** Wort-Pop: nur das aktuelle Wort, groß und mittig, springt herein. */
function WordPop({ line, wordIdx, color }: ModeProps) {
  const words = line.words ?? [{ text: line.text, startMs: line.startMs, endMs: line.endMs }];
  const w = words[Math.max(wordIdx, 0)];
  const sung = words
    .slice(0, Math.max(wordIdx, 0))
    .map((x) => x.text)
    .join(" ");
  return (
    <div
      className="flex flex-col items-center"
      style={{ "--c-singer": color } as CSSProperties}
      data-testid="lyrics-current"
      aria-label={line.text}
    >
      <p className="min-h-[1.2em] text-[clamp(14px,3vmin,32px)] font-semibold text-white/50">{sung}</p>
      <p
        key={wordIdx}
        className="word-pop lyric-glow text-[clamp(44px,13vmin,170px)] font-black leading-none"
        style={{ color: "var(--c-singer)" }}
      >
        {w?.text}
      </p>
    </div>
  );
}

/** Stapel: Wörter erscheinen nacheinander in unterschiedlichen Größen (Betonung = Wortlänge, letztes Wort groß). */
function Stack({ line, wordIdx, color }: ModeProps) {
  const words = markBackground(line.words ?? line.text.split(/\s+/).map((text) => ({ text, startMs: 0, endMs: 0 })));
  return (
    <p
      className="flex max-w-[92vw] flex-wrap items-baseline justify-center gap-x-[4.5vmin] gap-y-[0.5vmin] leading-[1.05]"
      style={{ "--c-singer": color } as CSSProperties}
      data-testid="lyrics-current"
      aria-label={line.text}
    >
      {words.map((w, i) => {
        const size = w.bg ? 4 : i === words.length - 1 ? 10.5 : w.text.length >= 7 ? 9 : w.text.length <= 3 ? 5.5 : 7.5;
        const state = i < wordIdx ? "sung" : i === wordIdx ? "now" : "next";
        return (
          <span
            key={i}
            className={`stack-word lyric-glow font-black ${w.bg ? "italic" : ""}`}
            data-state={state}
            style={{
              fontSize: `clamp(20px, ${size}vmin, ${size * 13}px)`,
              color: state === "next" ? "rgb(255 255 255 / 0.12)" : "var(--c-singer)",
            }}
          >
            {w.text}
          </span>
        );
      })}
    </p>
  );
}

/** Schreibmaschine: Buchstabe für Buchstabe im Takt der Wörter, mit Cursor. */
function Typewriter({ line, wordIdx, color }: ModeProps) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const words = line.words ?? [];
    const render = (p: number) => {
      if (!ref.current) return;
      const done = words.slice(0, Math.max(wordIdx, 0)).map((w) => w.text);
      const cur = words[wordIdx]?.text ?? "";
      const partial = cur.slice(0, Math.ceil(cur.length * p));
      ref.current.textContent = [...done, partial].filter(Boolean).join(" ");
    };
    render(songContext.getState().derived.wordProgress);
    return songContext.subscribe((s) => s.derived.wordProgress, render);
  }, [wordIdx, line]);
  return (
    <p className={BIG} style={{ color }} data-testid="lyrics-current" aria-label={line.text}>
      <span ref={ref} />
      <span className="typewriter-cursor" aria-hidden />
    </p>
  );
}

/** Duett: Sänger links/rechts in ihren Farben; der gerade Singende ist hell, der andere zeigt seine letzte Zeile. */
function Duet({
  song,
  lines,
  lineIdx,
  current,
  wordIdx,
  gap,
}: {
  song: SongStatic;
  lines: LyricLine[];
  lineIdx: number;
  current?: LyricLine;
  wordIdx: number;
  gap: React.ReactNode;
}) {
  const singers = song.lyrics?.singers ?? {};
  const agents = [...new Set(lines.map((l) => l.agent).filter((a): a is string => !!a && !!singers[a]))].slice(0, 2);
  // nur bereits begonnene Zeilen (vor der ersten Zeile: nichts)
  const lastOf = (agent: string) => [...lines.slice(0, lineIdx + 1)].reverse().find((l) => l.agent === agent);
  return (
    <div className="grid w-full grid-cols-2 items-end gap-[4vmin]" data-testid="lyrics-duet">
      {agents.map((agent, side) => {
        const artist = song.artists.find((a) => a.spotifyId === singers[agent]);
        const active = current?.agent === agent;
        const line = active ? current : lastOf(agent);
        return (
          <div
            key={agent}
            className={`flex flex-col gap-[1vmin] ${side === 0 ? "items-start text-left" : "items-end text-right"}`}
          >
            <span
              className="rounded-full px-3 py-0.5 text-[clamp(11px,1.9vmin,20px)] font-bold text-black"
              style={{ background: artist?.color, opacity: active ? 1 : 0.4 }}
            >
              {artist?.name}
            </span>
            {active && current ? (
              <div className="[&>p]:text-[clamp(24px,5.6vmin,72px)]">
                <Karaoke line={current} wordIdx={wordIdx} color={artist?.color ?? song.album.palette.accent} />
              </div>
            ) : (
              <p className="text-[clamp(16px,3.4vmin,40px)] font-semibold text-white/30">{line?.text ?? ""}</p>
            )}
          </div>
        );
      })}
      {!current && <div className="col-span-2">{gap}</div>}
    </div>
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
