"use client";

import { useMemo } from "react";
import { concertCardAt, countdown, formatConcertDate, todayLocal } from "@/lib/concerts/display";
import { DEMO_TODAY } from "@/lib/song-context/fixtures";
import { useSongContext } from "@/lib/song-context/store";
import { QrCode } from "./QrCode";

/** Konzertkarte am Songende: nächste Termine (Umkreis zuerst), Countdown, QR-Code zum Ticket. */
export function ConcertOverlay() {
  const song = useSongContext((s) => s.song);
  const derived = useSongContext((s) => s.derived);
  const frozen = useSongContext((s) => s.frozen);
  const second = useSongContext((s) => Math.floor(s.positionMs / 1000));
  const card = useMemo(() => (song ? concertCardAt(song, derived, second * 1000) : null), [song, derived, second]);
  if (!song || !card) return null;
  const today = frozen ? DEMO_TODAY : todayLocal();
  const qr = card.concerts.find((c) => c.ticketUrl && !c.soldOut);
  const multi = new Set(card.concerts.map((c) => c.artistId)).size > 1;

  return (
    <aside
      className="info-in pointer-events-none absolute inset-x-0 bottom-[10vmin] mx-auto flex w-[min(82vw,900px)] items-stretch gap-[2vmin] rounded-2xl bg-black/70 p-[2vmin] shadow-2xl backdrop-blur-md"
      data-testid="concert-card"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[1vmin]">
        <h2 className="text-[clamp(14px,2.6vmin,28px)] font-extrabold">
          {card.near ? "Live in deiner Nähe" : "Nächste Konzerte"}
          {card.area && (
            <span className="ml-2 text-[0.6em] font-semibold text-white/50" data-testid="concert-area">
              {card.area.name} · {card.area.radiusKm >= 5000 ? "überall" : `${card.area.radiusKm} km`}
            </span>
          )}
        </h2>
        <ul className="flex flex-col gap-[0.8vmin]">
          {card.concerts.map((c) => (
            <li key={`${c.artistId}${c.date}${c.city}`} className="flex items-baseline gap-[1.5vmin]" data-testid="concert-row">
              <span
                className="w-[16vmin] shrink-0 text-[clamp(11px,1.9vmin,19px)] font-bold"
                style={{ color: "var(--c-accent)" }}
              >
                {formatConcertDate(c.date)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[clamp(11px,1.9vmin,19px)]">
                {multi && <span className="font-semibold">{c.artistName} · </span>}
                {c.city}
                {c.venue && <span className="text-white/60"> · {c.venue}</span>}
                {c.distanceKm !== undefined && c.distanceKm > 0 && <span className="text-white/45"> · {c.distanceKm} km</span>}
              </span>
              {c.soldOut ? (
                <span className="shrink-0 rounded-full bg-red-600/80 px-2 text-[clamp(9px,1.5vmin,15px)] font-semibold">
                  ausverkauft
                </span>
              ) : (
                <span className="shrink-0 text-[clamp(10px,1.6vmin,16px)] text-white/70">{countdown(c.date, today)}</span>
              )}
            </li>
          ))}
        </ul>
        {card.concerts.some((c) => c.geocoded) && (
          <p className="text-[clamp(8px,1.2vmin,12px)] text-white/40" data-testid="osm-credit">
            Ortsdaten © OpenStreetMap
          </p>
        )}
        {card.liveHint && (
          <p className="text-[clamp(10px,1.6vmin,16px)] text-white/60" data-testid="live-hint">
            {card.liveHint}
          </p>
        )}
      </div>
      {qr?.ticketUrl && (
        <div className="flex shrink-0 flex-col items-center justify-center gap-1" data-testid="ticket-qr">
          <QrCode text={qr.ticketUrl} size="clamp(64px,14vmin,140px)" label={`Tickets ${qr.city}`} />
          <span className="text-[clamp(9px,1.4vmin,14px)] text-white/70">Tickets {qr.city}</span>
        </div>
      )}
    </aside>
  );
}
