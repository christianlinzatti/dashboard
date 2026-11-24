"use client";

import type { RefObject } from "react";
import type { SongStatic } from "@/lib/song-context/schema";
import { useSongContext } from "@/lib/song-context/store";
import type { SingAlong } from "@/lib/show/singalong";

/** 2D-Ebenen über der 3D-Bühne: Bildnachweis, Strobo, Blinder-Schein, Blackout mit Countdown, Mitsing-Hinweis */

export /** Ersatz ohne 3D (kein WebGL, Grafikfehler): ruhiger Farbverlauf aus der Cover-Palette. */
function Backdrop({ song }: { song: SongStatic | null }) {
  const p = song?.album.palette;
  return (
    <div
      className="absolute inset-0"
      data-testid="stage-fallback"
      style={{
        background: p ? `radial-gradient(ellipse at 50% 35%, ${p.dominant}55 0%, ${p.dark} 65%), ${p.dark}` : "#05030a",
      }}
    />
  );
}

export type OverlayRefs = {
  strobe: RefObject<HTMLDivElement | null>;
  glare: RefObject<HTMLDivElement | null>;
  blackout: RefObject<HTMLDivElement | null>;
  countdown: RefObject<HTMLDivElement | null>;
};

/** Ebenen, die der Director pro Bild direkt setzt (Deckkraft, Countdown-Ziffer) – ohne React-Rerender */
export function StageOverlays({
  refs: { strobe, glare, blackout, countdown },
  accent,
  photoCredit,
  singAlong,
}: {
  refs: OverlayRefs;
  accent: string;
  /** Bildnachweis des Wandfotos (nur auf Bühnen mit LED-Wand) */
  photoCredit: string | null;
  singAlong: SingAlong | null | undefined;
}) {
  return (
    <>
      {/* Bildnachweis fürs Foto auf der LED-Wand (Wikipedia/Commons verlangt Urheber und Lizenz) */}
      {photoCredit && (
        <p
          className="pointer-events-none absolute bottom-[6vmin] right-[3vmin] max-w-[45vw] truncate rounded bg-black/55 px-1.5 py-px text-right text-[clamp(8px,1.2vmin,11px)] text-white/70"
          data-testid="wall-photo-credit"
        >
          LED-Wand · {photoCredit}
        </p>
      )}
      {/* Stroboskop (nur bei Drops, abschaltbar) */}
      <div ref={strobe} className="pointer-events-none absolute inset-0 bg-white opacity-0" aria-hidden />
      {/* Blinder strahlen beim Einsatz warm in die Kamera */}
      <div
        ref={glare}
        className="pointer-events-none absolute inset-0 opacity-0 mix-blend-screen"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(255,190,110,0.85), rgba(255,150,70,0.25) 55%, rgba(0,0,0,0) 80%)",
        }}
        aria-hidden
      />
      {/* Blackout vor einem großen Einsatz: Raum dunkel, Lichtkegel in der Mitte, Countdown 4-3-2-1 */}
      <div
        ref={blackout}
        className="pointer-events-none absolute inset-0 opacity-0"
        style={{ background: "radial-gradient(ellipse 38% 55% at 50% 52%, rgba(0,0,0,0.25), rgba(0,0,0,0.92) 75%)" }}
        aria-hidden
      />
      <div
        ref={countdown}
        data-testid="countdown"
        className="pointer-events-none absolute inset-x-0 top-[12%] text-center font-black leading-none opacity-0"
        style={{
          fontSize: "min(28vh, 22vw)",
          color: accent,
          textShadow: `0 0 0.18em ${accent}`,
        }}
        aria-hidden
      />
      <SingAlongBadge window={singAlong} accent={accent} />
    </>
  );
}

/** Mitsing-Moment: kurze Einblendung über der Bühne, solange die Menge allein singt */
function SingAlongBadge({ window, accent }: { window: SingAlong | null | undefined; accent: string }) {
  const on = useSongContext((s) => !!window && s.positionMs > window.startMs && s.positionMs < window.endMs);
  if (!window) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[20%] z-20 flex justify-center transition-opacity duration-500"
      style={{ opacity: on ? 1 : 0 }}
      data-testid="singalong"
      data-visible={on}
      aria-hidden={!on}
    >
      <span
        className="rounded-full bg-black/55 px-[3vmin] py-[1vmin] text-[clamp(16px,3.4vmin,40px)] font-black uppercase tracking-wide"
        style={{ color: accent, textShadow: `0 0 0.4em ${accent}` }}
      >
        Alle zusammen!
      </span>
    </div>
  );
}
