"use client";

import { useEffect, useRef } from "react";
import { songContext, useSongContext } from "@/lib/song-context/store";
import { formatTime } from "./labels";

export function Progress() {
  const duration = useSongContext((s) => s.song?.track.durationMs ?? 0);
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
    <footer className="absolute inset-x-0 bottom-0 flex items-center gap-[2vmin] px-[3vmin] pb-[2.2vmin]" data-testid="progress">
      <span className="w-[7ch] text-[clamp(11px,1.9vmin,20px)] tabular-nums text-white/70">{formatTime(seconds * 1000)}</span>
      <div className="h-[0.8vmin] min-h-1 flex-1 overflow-hidden rounded-full bg-white/15">
        <div
          ref={bar}
          className="h-full origin-left rounded-full"
          style={{ background: "var(--c-accent)", transform: "scaleX(0)" }}
        />
      </div>
      <span className="w-[7ch] text-right text-[clamp(11px,1.9vmin,20px)] tabular-nums text-white/70">
        {formatTime(duration)}
      </span>
    </footer>
  );
}
