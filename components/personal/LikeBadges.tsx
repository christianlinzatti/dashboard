"use client";

import { useSongContext } from "@/lib/song-context/store";

/** ♥ Lieblingssong (Spotify), ♥ Last.fm, „37× gehört“ – nur was bekannt ist. */
export function LikeBadges() {
  const user = useSongContext((s) => s.song?.user);
  if (!user) return null;
  const chip = "rounded-full bg-white/10 px-[1.2vmin] py-[0.3vmin] text-[clamp(11px,1.8vmin,18px)] font-semibold backdrop-blur";
  return (
    <div className="mt-[0.6vmin] flex flex-wrap items-center gap-[0.8vmin]" data-testid="like-badges">
      {user.trackSaved && (
        <span className={chip} title="In deinen Spotify-Lieblingssongs" data-testid="badge-saved">
          <span style={{ color: "#1ed760" }}>♥</span> Lieblingssong
        </span>
      )}
      {user.lovedOnLastfm && (
        <span className={chip} title="Auf Last.fm geliebt" data-testid="badge-loved">
          <span style={{ color: "#d51007" }}>♥</span> Last.fm
        </span>
      )}
      {!!user.trackPlays && (
        <span className={chip} data-testid="badge-plays">
          {user.trackPlays.toLocaleString("de-DE")}× gehört
        </span>
      )}
    </div>
  );
}
