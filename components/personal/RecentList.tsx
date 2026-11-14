"use client";

import { useEffect, useState } from "react";
import type { RecentTrack } from "@/lib/personal/lastfm";

export function ago(unix: number | undefined, now = Date.now()): string {
  if (!unix) return "läuft gerade";
  const min = Math.floor((now / 1000 - unix) / 60);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? "gestern" : `vor ${d} Tagen`;
}

/** „Zuletzt gehört“ auf dem Startbildschirm (Last.fm, sonst Spotify). */
export function RecentList() {
  const [data, setData] = useState<{ source: string; tracks: RecentTrack[] } | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/recent")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setData(d))
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  const tracks = data?.tracks.filter((t) => !t.nowPlaying).slice(0, 6) ?? [];
  if (!tracks.length) return null;

  return (
    <section className="w-[min(92vw,720px)] text-left" data-testid="recent-list">
      <h2 className="mb-[1vmin] text-[clamp(13px,2.2vmin,22px)] font-bold text-white/70">
        Zuletzt gehört <span className="font-normal text-white/40">· {data?.source === "lastfm" ? "Last.fm" : "Spotify"}</span>
      </h2>
      <ul className="grid grid-cols-1 gap-[1vmin] sm:grid-cols-2">
        {tracks.map((t, i) => (
          <li key={`${t.title}-${i}`} className="flex items-center gap-[1.5vmin] rounded-xl bg-white/5 p-[1vmin]">
            {t.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Cover von Last.fm/Spotify
              <img src={t.imageUrl} alt="" className="size-[clamp(36px,6vmin,56px)] rounded-md object-cover" />
            ) : (
              <div className="size-[clamp(36px,6vmin,56px)] rounded-md bg-white/10" />
            )}
            <div className="min-w-0">
              <p className="truncate text-[clamp(12px,2vmin,20px)] font-semibold">
                {t.loved && <span className="mr-1 text-[#d51007]">♥</span>}
                {t.title}
              </p>
              <p className="truncate text-[clamp(11px,1.7vmin,17px)] text-white/60">
                {t.artist} · {ago(t.playedAt)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
