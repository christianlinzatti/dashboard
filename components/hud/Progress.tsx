"use client";

import { useEffect, useMemo, useRef } from "react";
import type { SectionKind } from "@/lib/song-context/schema";
import { contiguous } from "@/lib/song-context/sections";
import { songContext, useSongContext } from "@/lib/song-context/store";
import { formatTime } from "./labels";

/** Deckkraft je Abschnittsart: Refrains springen ins Auge, Intro/Outro treten zurück */
const SECTION_LEVEL: Record<SectionKind, number> = {
  intro: 0.1,
  verse: 0.26,
  prechorus: 0.4,
  chorus: 0.75,
  bridge: 0.45,
  instrumental: 0.16,
  outro: 0.1,
};

export function Progress() {
  const duration = useSongContext((s) => s.song?.track.durationMs ?? 0);
  // Songstruktur (aus den Lyrics erkannt oder vom Anbieter): Abschnitte als Segmente über der Leiste
  const sections = useSongContext((s) => s.song?.lyrics?.sections);
  const structure = useMemo(() => (sections?.length && duration ? contiguous(sections, duration) : []), [sections, duration]);
  const seconds = useSongContext((s) => Math.floor(s.positionMs / 1000));
  const bar = useRef<HTMLDivElement>(null);

  // Balken pro Frame direkt aktualisieren (ohne React-Rerender)
  useEffect(() => {
    const apply = (pos: number) => {
      if (bar.current && duration) bar.current.style.transform = `scaleX(${Math.min(pos / duration, 1)})`;
    };
    apply(songContext.getState().positionMs);
    return songContext.subscribe((s) => s.positionMs, apply);
  }, [duration]);

  return (
    <footer
      className="burnin-drift absolute inset-x-0 bottom-0 flex items-center gap-[2vmin] px-[3vmin] pb-[2.2vmin]"
      data-testid="progress"
    >
      <span className="w-[7ch] text-[clamp(11px,1.9vmin,20px)] tabular-nums text-white/70">{formatTime(seconds * 1000)}</span>
      <div className="relative h-[0.8vmin] min-h-1 flex-1 rounded-full bg-white/15">
        {structure.length > 1 && (
          <div
            className="absolute inset-x-0 bottom-full mb-[0.5vmin] flex h-[0.55vmin] min-h-[3px] gap-[2px]"
            data-testid="structure"
            aria-hidden
          >
            {structure.map((sec) => (
              <span
                key={sec.startMs}
                className="h-full rounded-full"
                data-kind={sec.kind}
                style={{
                  flexGrow: sec.endMs - sec.startMs,
                  flexBasis: 0,
                  background: sec.kind === "chorus" || sec.kind === "prechorus" ? "var(--c-accent)" : "#fff",
                  opacity: SECTION_LEVEL[sec.kind],
                }}
              />
            ))}
          </div>
        )}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          <div
            ref={bar}
            className="h-full origin-left rounded-full"
            style={{ background: "var(--c-accent)", transform: "scaleX(0)" }}
          />
        </div>
      </div>
      <span className="w-[7ch] text-right text-[clamp(11px,1.9vmin,20px)] tabular-nums text-white/70">
        {formatTime(duration)}
      </span>
    </footer>
  );
}
