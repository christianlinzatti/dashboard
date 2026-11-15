"use client";

import type { CSSProperties } from "react";
import type { ModeProps } from "../shared";

/** Wort-Pop: nur das aktuelle Wort, groß und mittig, springt herein. */
export function WordPop({ line, wordIdx, color }: ModeProps) {
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
