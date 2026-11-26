"use client";

import { useEffect } from "react";
import { settings, useSettings } from "@/lib/settings";

/** KI verwenden: Show-Regie und Übersetzung der Lyrics – oder nur die Regeln (keine KI-Anfragen) */
export function AiSection() {
  // Geräte-Einstellungen erst laden – sonst würde die Auswahl die übrigen (Qualität, Strobo …) mit Standardwerten überschreiben
  useEffect(() => settings.getState().hydrate(), []);
  const on = useSettings((s) => s.ai);
  const set = useSettings((s) => s.set);
  const chip = (active: boolean) =>
    `min-h-12 rounded-full px-5 text-lg font-semibold ${active ? "bg-white text-black" : "bg-white/10 text-white"}`;
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white/5 p-5" aria-labelledby="ki" data-testid="ai-settings">
      <h2 id="ki" className="text-xl font-bold">
        KI verwenden
      </h2>
      <p className="text-white/70">
        Mit KI wählt die Regie Bühne, Abschnitte, Motto und Ansagen passend zum Song, und fremdsprachige Lyrics bekommen eine
        deutsche Übersetzung. Ohne KI läuft die Show nach festen Regeln (Genre, Stimmung, Songaufbau), und es gehen keine Anfragen
        an die KI. Gilt ab dem nächsten Song.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={chip(on)} aria-pressed={on} onClick={() => set({ ai: true })} data-testid="ai-on">
          An
        </button>
        <button type="button" className={chip(!on)} aria-pressed={!on} onClick={() => set({ ai: false })} data-testid="ai-off">
          Aus
        </button>
      </div>
      <p className="text-sm text-white/50">Gilt auf allen Geräten (im Konto gespeichert).</p>
    </section>
  );
}
