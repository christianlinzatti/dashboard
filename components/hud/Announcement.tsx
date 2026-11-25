"use client";

import { useMemo } from "react";
import { announcementFor } from "@/lib/show/announce";
import { useEveningPhase } from "@/lib/stage/setlist";
import { useSongContext } from "@/lib/song-context/store";

/** nach dem Motto (bis 7 s), während die Band noch ihren Platz einnimmt */
export const ANNOUNCE_FROM_MS = 7500;
export const ANNOUNCE_UNTIL_MS = 14_500;

/**
 * Ansage des Sängers zum Songstart als Sprechblase oben links (unter Titel und Abzeichen). Weicht,
 * sobald gesungen wird – der Songtext hat Vorrang.
 */
export function Announcement() {
  const song = useSongContext((s) => s.song);
  const visible = useSongContext(
    (s) => s.positionMs >= ANNOUNCE_FROM_MS && s.positionMs < ANNOUNCE_UNTIL_MS && !s.derived.lineActive,
  );
  const phase = useEveningPhase(song?.trackKey, song?.music.mood);
  const text = useMemo(
    () =>
      song
        ? announcementFor({
            trackKey: song.trackKey,
            title: song.track.title,
            phase,
            liked: !!(song.user?.trackSaved || song.user?.lovedOnLastfm),
            city: song.concertArea?.name,
            ai: song.show?.announcements,
          })
        : "",
    [song, phase],
  );
  const singer = song?.artists[0]?.name;
  if (!song || !text || !singer) return null;
  return (
    <div
      className="pointer-events-none absolute left-[3vmin] top-[19vmin] max-w-[min(62vw,720px)] rounded-2xl rounded-tl-sm bg-black/60 px-[2vmin] py-[1vmin] backdrop-blur transition-opacity duration-500"
      style={{ opacity: visible ? 1 : 0 }}
      data-testid="announcement"
      data-visible={visible}
      data-phase={phase}
      aria-live="polite"
    >
      <div
        className="text-[clamp(10px,1.5vmin,15px)] font-semibold uppercase tracking-[0.2em]"
        style={{ color: "var(--c-accent, #ff4fd8)" }}
      >
        🎤 {singer}
      </div>
      <div className="mt-[0.3vmin] text-[clamp(13px,2.3vmin,24px)] font-semibold leading-snug">{text}</div>
    </div>
  );
}
