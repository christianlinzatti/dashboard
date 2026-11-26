"use client";

import { useEffect } from "react";
import { canvasModes, settings, useSettings, type CanvasMode } from "@/lib/settings";

const LABEL: Record<CanvasMode, string> = { aus: "Aus", buehne: "Auf der LED-Wand", vollbild: "Vollbild" };

/** Spotify Canvas (Loop-Video zum Song): aus, auf der LED-Wand der Bühne oder als Vollbild statt der Bühne */
export function CanvasSection() {
  // Geräte-Einstellungen erst laden – sonst würde die Auswahl die übrigen (Qualität, Strobo …) mit Standardwerten überschreiben
  useEffect(() => settings.getState().hydrate(), []);
  const mode = useSettings((s) => s.canvas);
  const set = useSettings((s) => s.set);
  const chip = (active: boolean) =>
    `min-h-12 rounded-full px-5 text-lg font-semibold ${active ? "bg-white text-black" : "bg-white/10 text-white"}`;
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white/5 p-5" aria-labelledby="canvas" data-testid="canvas-settings">
      <h2 id="canvas" className="text-xl font-bold">
        Spotify Canvas
      </h2>
      <p className="text-white/70">
        Das kurze Loop-Video, das Spotify zu manchen Songs zeigt. „Auf der LED-Wand“ spielt es auf der großen Wand hinter der Band
        – nur die Bühnen Club, Festival und Stadion haben eine. „Vollbild“ zeigt es statt der Bühne. Nicht jeder Song hat eins; ob
        es klappt, steht in /debug unter „Kurzdiagnose“.
      </p>
      <div className="flex flex-wrap gap-3">
        {canvasModes.map((m) => (
          <button
            key={m}
            type="button"
            className={chip(mode === m)}
            aria-pressed={mode === m}
            onClick={() => set({ canvas: m })}
            data-testid={`canvas-${m}`}
          >
            {LABEL[m]}
          </button>
        ))}
      </div>
      <p className="text-sm text-white/50">Gilt auf allen Geräten (im Konto gespeichert).</p>
    </section>
  );
}
