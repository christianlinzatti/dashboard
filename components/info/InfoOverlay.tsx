"use client";

import { useMemo } from "react";
import { factAt, infoCardAt } from "@/lib/info/display";
import { displayUrl } from "@/lib/info/photos";
import { useSongContext } from "@/lib/song-context/store";

/** Infokarte (Intro, Instrumental, Pausen) und Fakten-Ticker (Strophen). */
export function InfoOverlay() {
  const song = useSongContext((s) => s.song);
  const derived = useSongContext((s) => s.derived);
  // auf ganze Sekunden runden: Karte/Ticker wechseln nicht pro Frame
  const second = useSongContext((s) => Math.floor(s.positionMs / 1000));
  const card = useMemo(() => (song ? infoCardAt(song, derived, second * 1000) : null), [song, derived, second]);
  const fact = useMemo(() => (song ? factAt(song, derived, second * 1000) : null), [song, derived, second]);
  if (!song) return null;

  return (
    <>
      {fact && (
        <div
          key={fact}
          className="info-in pointer-events-none absolute left-[3vmin] top-[15vmin] rounded-full bg-black/55 px-[2vmin] py-[0.8vmin] text-[clamp(12px,2.1vmin,22px)] font-semibold backdrop-blur"
          data-testid="fact-ticker"
        >
          {fact}
        </div>
      )}
      {card && (
        <aside
          key={card.id}
          className="info-in pointer-events-none absolute inset-x-0 bottom-[10vmin] mx-auto flex w-[min(78vw,860px)] overflow-hidden rounded-2xl bg-black/65 shadow-2xl backdrop-blur-md"
          data-testid="info-card"
        >
          {card.photo && (
            <div className="relative w-[36%] shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- externe, lizenzierte Fotos ohne Bildoptimierung */}
              <img
                src={displayUrl(card.photo.url, 640)}
                alt={`Foto: ${card.name}`}
                className="ken-burns absolute inset-0 size-full object-cover"
                crossOrigin="anonymous"
              />
              <p
                className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-0.5 text-[clamp(8px,1.3vmin,12px)] text-white/80"
                data-testid="photo-credit"
              >
                Foto: {card.photo.credit} · {card.photo.license}
              </p>
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-[0.8vmin] p-[2vmin]">
            <div className="flex flex-wrap items-center gap-2">
              {card.logo ? (
                <h2 className="leading-none">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Schriftzug (TheAudioDB) */}
                  <img
                    src={displayUrl(card.logo, 640)}
                    alt={card.name}
                    className="h-[clamp(20px,4.5vmin,48px)] w-auto max-w-[45vmin] object-contain"
                    data-testid="artist-logo"
                  />
                </h2>
              ) : (
                <h2 className="text-[clamp(16px,3.2vmin,36px)] font-extrabold leading-tight">{card.name}</h2>
              )}
              {card.facts.map((f) => (
                <span
                  key={f}
                  className="rounded-full px-2.5 py-0.5 text-[clamp(10px,1.6vmin,16px)] font-semibold text-black"
                  style={{ background: "var(--c-accent)" }}
                >
                  {f}
                </span>
              ))}
            </div>
            {card.summary && (
              <p className="line-clamp-3 text-[clamp(11px,2vmin,20px)] leading-snug text-white/85">{card.summary}</p>
            )}
            {card.summary && (
              <p className="text-[clamp(8px,1.3vmin,12px)] text-white/50">
                {card.textSource === "theaudiodb"
                  ? "Text: TheAudioDB"
                  : `Text: Wikipedia${card.lang === "en" ? " (englisch)" : ""} · CC BY-SA`}
              </p>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
