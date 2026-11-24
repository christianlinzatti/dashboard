"use client";

import { useMemo } from "react";
import { creditsDurationS, creditsFor } from "@/lib/show/credits";
import type { Recap } from "@/lib/show/recap";

const time = (ms: number) => new Date(ms).toLocaleDateString("de-AT", { weekday: "long", day: "numeric", month: "long" });

/** Abspann über den ganzen Bildschirm, rollt einmal durch; Antippen überspringt ihn */
export function Credits({ recap, lamps, onDone }: { recap: Recap; lamps: boolean; onDone: () => void }) {
  const lines = useMemo(() => creditsFor(recap, { date: time(recap.since), lamps }), [recap, lamps]);
  const seconds = creditsDurationS(lines.length);
  return (
    <div
      className="fixed inset-0 z-30 overflow-hidden bg-[radial-gradient(ellipse_at_center,#1a0b2e_0%,#05030a_70%)] text-white"
      onPointerDown={onDone}
      data-testid="credits"
      role="dialog"
      aria-label="Abspann des Abends"
    >
      <div
        className="credits-roll absolute inset-x-0 top-full flex flex-col items-center gap-[1.2vmin] px-6 text-center"
        style={{ animationDuration: `${seconds}s` }}
        onAnimationEnd={onDone}
      >
        {lines.map((l, i) =>
          l.kind === "titel" ? (
            <div key={i} className="mb-[3vmin]">
              <div className="text-[clamp(22px,5vmin,56px)] font-black tracking-wide">{l.text}</div>
              {l.sub && <div className="text-[clamp(13px,2.2vmin,22px)] text-white/60">{l.sub}</div>}
            </div>
          ) : l.kind === "abschnitt" ? (
            <div
              key={i}
              className="mt-[5vmin] text-[clamp(11px,1.8vmin,18px)] font-semibold uppercase tracking-[0.4em]"
              style={{ color: "var(--c-accent, #ff4fd8)" }}
            >
              {l.text}
            </div>
          ) : l.kind === "dank" ? (
            <div key={i} className="mt-[10vmin] text-[clamp(22px,5vmin,56px)] font-black">
              {l.text}
            </div>
          ) : (
            <div key={i} className="leading-tight" data-testid="credits-line">
              <div className="text-[clamp(14px,2.6vmin,28px)] font-semibold">{l.text}</div>
              {l.sub && <div className="text-[clamp(11px,1.8vmin,18px)] text-white/55">{l.sub}</div>}
            </div>
          ),
        )}
      </div>
      <div className="absolute bottom-[2vmin] right-[3vmin] text-[clamp(10px,1.5vmin,14px)] text-white/40">
        Antippen zum Überspringen
      </div>
    </div>
  );
}
