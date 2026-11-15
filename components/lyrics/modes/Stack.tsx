"use client";

import type { CSSProperties } from "react";
import { markBackground } from "@/lib/lyrics/director";
import type { ModeProps } from "../shared";

/** Stapel: Wörter erscheinen nacheinander in unterschiedlichen Größen (Betonung = Wortlänge, letztes Wort groß). */
export function Stack({ line, wordIdx, color }: ModeProps) {
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
