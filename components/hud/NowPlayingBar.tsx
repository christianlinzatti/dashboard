"use client";

import Image from "next/image";
import { useSongContext } from "@/lib/song-context/store";
import { artistLine, lyricsLabel, sectionLabel } from "./labels";
import { LikeBadges } from "../personal/LikeBadges";

export function NowPlayingBar() {
  const song = useSongContext((s) => s.song);
  const bpm = useSongContext((s) => Math.round(s.live.bpm));
  const locked = useSongContext((s) => s.live.tempoLocked);
  const micActive = useSongContext((s) => s.live.micActive);
  const section = useSongContext((s) => s.derived.section);
  if (!song) return null;

  return (
    <header className="absolute inset-x-0 top-0 flex items-center gap-[2vmin] px-[3vmin] pt-[2.5vmin]" data-testid="now-playing">
      <Image
        src={song.album.coverUrl}
        alt={`Cover: ${song.album.name}`}
        width={96}
        height={96}
        unoptimized
        priority
        className="size-[clamp(48px,10vmin,112px)] rounded-xl shadow-lg shadow-black/50"
      />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[clamp(18px,4.2vmin,48px)] font-bold leading-tight">{song.track.title}</h1>
        <p className="truncate text-[clamp(14px,2.8vmin,30px)] text-white/70">
          {artistLine(song)}
          {song.artists.some((a) => song.user?.artists[a.spotifyId]?.following) && (
            <span
              className="ml-2 text-[0.85em]"
              style={{ color: "#ffd23f" }}
              title="Du folgst diesem Künstler"
              data-testid="badge-following"
            >
              ★
            </span>
          )}
        </p>
        <LikeBadges />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-[0.8vmin] text-[clamp(11px,1.9vmin,20px)] font-medium">
        <span
          className="flex items-center gap-[0.8vmin] rounded-full bg-white/10 px-[1.4vmin] py-[0.4vmin] backdrop-blur"
          data-testid="bpm"
        >
          {micActive && <MicDot />}
          {micActive && !locked ? "~" : ""}
          {bpm} BPM
        </span>
        <span className="rounded-full bg-white/10 px-[1.4vmin] py-[0.4vmin] backdrop-blur" data-testid="lyrics-quality">
          {lyricsLabel(song)}
        </span>
        {section && (
          <span
            className="rounded-full px-[1.4vmin] py-[0.4vmin] text-black"
            style={{ background: "var(--c-accent)" }}
            data-testid="section"
          >
            {sectionLabel[section]}
          </span>
        )}
      </div>
    </header>
  );
}

/** Roter Punkt: Mikrofon ist aktiv (Audio wird nur lokal ausgewertet). */
function MicDot() {
  return (
    <span
      className="size-[1.1vmin] min-h-2 min-w-2 rounded-full bg-red-500"
      aria-label="Mikrofon aktiv"
      title="Mikrofon aktiv"
      data-testid="mic-indicator"
    />
  );
}
