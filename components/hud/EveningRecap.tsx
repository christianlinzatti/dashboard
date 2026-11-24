"use client";

/* eslint-disable @next/next/no-img-element -- Cover von Spotify, klein */
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { displayUrl } from "@/lib/info/photos";
import { recapStore, summarize, type Recap } from "@/lib/show/recap";
import { GalleryShare } from "./GalleryShare";
import { RecapShare } from "./RecapShare";

const PHASE_BADGE: Record<string, string> = { hoehepunkt: "Höhepunkt", zugabe: "Zugabe", durchatmen: "Durchatmen" };

const time = (ms: number) => new Date(ms).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });

/**
 * Rückblick auf den Abend im Startbildschirm, sobald die Musik aus ist: wie viele Songs, wie lange, Höhepunkte,
 * Zugaben, Lieblingssongs und die letzten Titel mit Cover.
 */
export function useEveningRecap(): Recap | null {
  const log = useStore(recapStore, (s) => s.log);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    recapStore.getState().hydrate();
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now === null ? null : summarize(log, now);
}

export function EveningRecap({ recap }: { recap: Recap }) {
  const facts = [
    `${recap.songs} Songs`,
    recap.minutes >= 60 ? `${Math.floor(recap.minutes / 60)} Std. ${recap.minutes % 60} Min.` : `${recap.minutes} Min.`,
    `seit ${time(recap.since)} Uhr`,
    recap.liked ? `${recap.liked} Lieblingssong${recap.liked === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <section className="w-[min(92vw,820px)] rounded-2xl bg-white/5 p-[2vmin] text-left" data-testid="evening-recap">
      <h2 className="text-[clamp(16px,3vmin,30px)] font-bold">Euer Abend</h2>
      <p className="mt-[0.5vmin] text-[clamp(12px,2.1vmin,21px)] text-white/70" data-testid="recap-facts">
        {facts.join(" · ")}
      </p>
      {(recap.highlights.length > 0 || recap.encores.length > 0 || recap.topArtist || recap.tips.length > 0) && (
        <ul className="mt-[1vmin] space-y-[0.4vmin] text-[clamp(12px,2vmin,20px)]">
          {recap.highlights.length > 0 && (
            <li>
              <span className="font-semibold text-amber-300">Höhepunkt:</span> {recap.highlights.join(", ")}
            </li>
          )}
          {recap.encores.length > 0 && (
            <li>
              <span className="font-semibold text-fuchsia-300">Zugabe:</span> {recap.encores.join(", ")}
            </li>
          )}
          {recap.topArtist && (
            <li>
              <span className="font-semibold text-cyan-300">Meistgespielt:</span> {recap.topArtist.name} ({recap.topArtist.songs}{" "}
              Songs)
            </li>
          )}
          {recap.tips.length > 0 && (
            <li data-testid="recap-tips">
              <span className="font-semibold text-emerald-300">Tipp fürs nächste Mal:</span> {recap.tips.join(", ")}
            </li>
          )}
        </ul>
      )}
      <ol className="mt-[1.5vmin] grid grid-cols-1 gap-[1vmin] sm:grid-cols-2" data-testid="recap-songs">
        {recap.recent.slice(0, 6).map((e) => (
          <li key={`${e.trackKey}-${e.at}`} className="flex items-center gap-[1.5vmin] rounded-xl bg-white/5 p-[1vmin]">
            {e.coverUrl ? (
              <img
                src={displayUrl(e.coverUrl, 128)}
                alt=""
                className="size-[clamp(32px,5vmin,48px)] rounded-md bg-white/10 object-cover"
                onError={(ev) => (ev.currentTarget.style.visibility = "hidden")}
              />
            ) : (
              <div className="size-[clamp(32px,5vmin,48px)] rounded-md bg-white/10" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[clamp(12px,2vmin,19px)] font-semibold">
                {e.liked && <span className="mr-1 text-[#1ed760]">♥</span>}
                {e.title}
              </p>
              <p className="truncate text-[clamp(11px,1.7vmin,16px)] text-white/60">
                {e.artist} · {time(e.at)}
              </p>
            </div>
            {e.phase && PHASE_BADGE[e.phase] && (
              <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[clamp(10px,1.5vmin,14px)]">
                {PHASE_BADGE[e.phase]}
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-[1.5vmin] flex flex-wrap items-center gap-[2vmin]">
        <RecapShare recap={recap} />
        <GalleryShare />
      </div>
    </section>
  );
}
