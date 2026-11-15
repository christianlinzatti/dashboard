"use client";

import { useMemo } from "react";
import { cardShownAt } from "@/lib/info/display";
import { planLyricsModes, type LyricsMode } from "@/lib/lyrics/director";
import { secondLineFor } from "@/lib/lyrics/second-line";
import { useSettings } from "@/lib/settings";
import type { LyricLine, SongStatic } from "@/lib/song-context/schema";
import { useSongContext } from "@/lib/song-context/store";
import { Duet } from "./modes/Duet";
import { Karaoke } from "./modes/Karaoke";
import { SecondLineView } from "./modes/SecondLineView";
import { Stack } from "./modes/Stack";
import { Typewriter } from "./modes/Typewriter";
import { WordPop } from "./modes/WordPop";
import { Context, Dots, singerColor } from "./shared";

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
  const secondMode = useSettings((s) => s.secondLine);

  const sectionsKey = song?.lyrics?.sections.map((s) => s.startMs).join() ?? "";
  const modes = useMemo(
    () => (song ? planLyricsModes(song) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei inhaltlicher Änderung neu planen
    [song?.trackKey, song?.lyrics?.provider, sectionsKey],
  );

  // Während Info- oder Konzertkarte den unteren Bereich nutzt, macht die Lyrics-Anzeige Platz
  const cardShown = useSongContext((s) =>
    s.song ? cardShownAt(s.song, s.derived, Math.floor(s.positionMs / 1000) * 1000) : false,
  );

  const lines = song?.lyrics?.quality !== "plain" ? song?.lyrics?.lines : undefined;
  if (cardShown) return null;
  if (!song || !lines?.length) return <NoLyrics song={song} />;

  const current = lineActive ? lines[lineIdx] : undefined;
  const second = current && song.lyrics ? secondLineFor(song.lyrics, current, secondMode) : null;
  const planned: LyricsMode = forceMode ?? modes[lineActive ? lineIdx : lineIdx + 1] ?? "karaoke";
  // Wort-Pop/Schreibmaschine zeigen nur ein Wort bzw. tippen – mit zweiter Zeile lieber Karaoke
  const mode: LyricsMode = second && !forceMode && (planned === "wortpop" || planned === "schreibmaschine") ? "karaoke" : planned;
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
        <Duet song={song} lines={lines} lineIdx={lineIdx} current={current} wordIdx={wordIdx} gap={gap} second={second} />
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
          {/* Umschrift/Übersetzung ersetzt die Vorschau der nächsten Zeile (Platz auf 10 Zoll) */}
          {current && second && (mode === "karaoke" || mode === "stapel") ? (
            <SecondLineView key={`2-${lineIdx}`} line={current} second={second} color={color(current)} />
          ) : (
            <Context text={next?.text} />
          )}
        </>
      )}
    </section>
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
