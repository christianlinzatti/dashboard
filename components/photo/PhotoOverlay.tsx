"use client";

import { useEffect } from "react";
import { useStore } from "zustand";
import { QrCode } from "@/components/concerts/QrCode";
import { photoStore } from "@/lib/photo/store";

/** So lange bleibt die Foto-Karte stehen */
export const PHOTO_CARD_MS = 25_000;

/** Erinnerungsfoto: kurzer Blitz, dann Vorschau mit QR-Code zum Handy (rechts, über den Lyrics), blendet nach 25 s aus */
export function PhotoOverlay() {
  const { phase, image, id, error } = useStore(photoStore);
  useEffect(() => {
    if (phase !== "fertig" && phase !== "fehler") return;
    const t = setTimeout(() => photoStore.getState().clear(), phase === "fehler" ? 6000 : PHOTO_CARD_MS);
    return () => clearTimeout(t);
  }, [phase]);
  if (phase === "aus") return null;
  // erst nach einem Auslöser sichtbar (nie beim ersten Rendern auf dem Server) – window ist dann da
  const url = id ? `${window.location.origin}/foto/${id}` : null;
  return (
    <>
      {phase === "hochladen" && <div className="photo-flash pointer-events-none absolute inset-0 z-40 bg-white" />}
      <div
        className="info-in pointer-events-none absolute right-[3vmin] top-[26vmin] z-40 flex items-center gap-[2vmin] rounded-2xl bg-black/75 p-[1.6vmin] shadow-2xl backdrop-blur-md"
        data-testid="photo-card"
        data-phase={phase}
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- Vorschau aus dem eigenen Canvas
          <img src={image} alt="Erinnerungsfoto" className="h-[18vmin] rounded-lg" />
        )}
        <div className="flex flex-col items-center gap-[0.8vmin] text-center">
          {phase === "aufnahme" || phase === "hochladen" ? (
            <span className="text-[clamp(12px,2vmin,20px)] font-bold">📸 Foto …</span>
          ) : phase === "fehler" ? (
            <span className="max-w-[24vmin] text-[clamp(11px,1.8vmin,18px)] text-red-300" data-testid="photo-error">
              {error}
            </span>
          ) : url ? (
            <>
              <QrCode text={url} size="16vmin" label="QR-Code zum Erinnerungsfoto" />
              <span className="text-[clamp(10px,1.6vmin,16px)] font-semibold" data-testid="photo-link" data-url={url}>
                Foto aufs Handy
              </span>
            </>
          ) : (
            <span className="max-w-[24vmin] text-[clamp(11px,1.8vmin,18px)] text-white/70">Demo: nicht hochgeladen</span>
          )}
        </div>
      </div>
    </>
  );
}
