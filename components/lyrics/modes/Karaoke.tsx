"use client";

import type { CSSProperties } from "react";
import { markBackground } from "@/lib/lyrics/director";
import { BIG, useFill, type ModeProps } from "../shared";

/** Karaoke: ganze Zeile, Wörter füllen sich nacheinander. */
export function Karaoke({ line, wordIdx, color }: ModeProps) {
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
