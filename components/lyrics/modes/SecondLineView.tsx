"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { secondLineFill, type SecondLine } from "@/lib/lyrics/second-line";
import type { LyricLine } from "@/lib/song-context/schema";
import { songContext } from "@/lib/song-context/store";

/** Zweite Zeile (Umschrift mit eigenem Timing oder Übersetzung), Füllung pro Frame direkt im DOM. */
export function SecondLineView({ line, second, color }: { line: LyricLine; second: SecondLine; color: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const apply = (t: number) => {
      const spans = ref.current?.querySelectorAll<HTMLElement>("[data-fill]");
      if (!spans) return;
      secondLineFill(line, second, t).forEach((p, i) => spans[i]?.style.setProperty("--p", String(p)));
    };
    apply(songContext.getState().positionMs);
    return songContext.subscribe((s) => s.positionMs, apply);
  }, [line, second]);
  const parts = second.words?.length ? second.words.map((w) => w.text) : [second.text];
  return (
    <p
      ref={ref}
      className={`text-[clamp(16px,3.8vmin,44px)] font-semibold leading-tight ${second.kind === "uebersetzung" ? "italic" : ""}`}
      style={{ "--c-singer": color } as CSSProperties}
      data-testid="lyrics-second"
      data-kind={second.kind}
      lang={second.lang}
    >
      {parts.map((text, i) => (
        <span key={i}>
          {i > 0 && " "}
          <span data-fill className="word-fill">
            {text}
          </span>
        </span>
      ))}
    </p>
  );
}
