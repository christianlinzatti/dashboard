"use client";

import { useMemo } from "react";
import { mottoFor } from "@/lib/show/motto";
import { useSongContext } from "@/lib/song-context/store";

/** Sichtbar in den ersten Sekunden eines Songs (während die Crew auf die Bühne kommt) */
const SHOW_FROM_MS = 400;
const SHOW_UNTIL_MS = 7000;

/** Motto der Show: zum Songstart groß eingeblendet, blendet dann aus. */
export function MottoBanner() {
  const song = useSongContext((s) => s.song);
  const visible = useSongContext((s) => s.positionMs >= SHOW_FROM_MS && s.positionMs < SHOW_UNTIL_MS);
  const motto = useMemo(() => (song ? mottoFor(song) : ""), [song]);
  if (!song || !motto) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[17%] flex justify-center px-[6vmin] transition-opacity duration-700"
      style={{ opacity: visible ? 1 : 0 }}
      data-testid="motto"
      data-visible={visible}
      aria-live="polite"
    >
      <div className="max-w-[80%] text-center">
        <div className="text-[clamp(10px,1.6vmin,16px)] font-semibold uppercase tracking-[0.4em] text-white/60">Motto</div>
        <div
          className="mt-[0.6vmin] text-balance text-[clamp(18px,3.6vmin,44px)] font-black leading-tight"
          style={{ color: "var(--c-light, #fff)", textShadow: "0 0 0.5em var(--c-accent, #ff4fd8), 0 2px 12px rgb(0 0 0 / 0.7)" }}
        >
          {motto}
        </div>
      </div>
    </div>
  );
}
