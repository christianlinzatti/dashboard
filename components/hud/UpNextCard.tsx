"use client";

import { useStore } from "zustand";
import { useSongContext } from "@/lib/song-context/store";
import { upNextStore, upNextVisible } from "@/lib/show/up-next";

/** „Gleich kommt …“: kleine Vorschau oben rechts in den letzten Sekunden eines Songs */
export function UpNextCard() {
  const trackKey = useSongContext((s) => s.song?.trackKey);
  const visible = useSongContext((s) => !!s.song && upNextVisible(s.song.track.durationMs, s.positionMs));
  const { forTrack, next } = useStore(upNextStore);
  if (!next || forTrack !== trackKey) return null;
  return (
    <div
      className="pointer-events-none absolute right-[3vmin] top-[17vmin] flex max-w-[min(42vw,420px)] items-center gap-[1.4vmin] rounded-xl bg-black/60 p-[1.2vmin] pr-[2vmin] shadow-xl backdrop-blur-md transition-all duration-700"
      style={{ opacity: visible ? 1 : 0, transform: visible ? "none" : "translateX(1.5em)" }}
      data-testid="up-next"
      data-visible={visible}
      aria-live="polite"
    >
      {next.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- kleines Cover von Spotify, kein Next-Image nötig
        <img src={next.coverUrl} alt="" className="size-[6.5vmin] shrink-0 rounded-md object-cover" />
      ) : (
        <div className="size-[6.5vmin] shrink-0 rounded-md bg-[var(--c-accent,#ff4fd8)]/40" />
      )}
      <div className="min-w-0">
        <div className="text-[clamp(9px,1.4vmin,14px)] font-semibold uppercase tracking-[0.3em] text-white/60">Gleich</div>
        <div className="truncate text-[clamp(13px,2.2vmin,24px)] font-extrabold leading-tight">{next.title}</div>
        <div className="truncate text-[clamp(11px,1.7vmin,18px)] text-white/70">{next.artists.join(", ")}</div>
      </div>
    </div>
  );
}
