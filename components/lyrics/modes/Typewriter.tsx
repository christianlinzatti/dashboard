"use client";

import { useEffect, useRef } from "react";
import { songContext } from "@/lib/song-context/store";
import { BIG, type ModeProps } from "../shared";

/** Schreibmaschine: Buchstabe für Buchstabe im Takt der Wörter, mit Cursor. */
export function Typewriter({ line, wordIdx, color }: ModeProps) {
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
