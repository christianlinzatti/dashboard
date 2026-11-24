"use client";

import { useEffect } from "react";
import { playApplause } from "@/lib/live/crowd-sound";
import { settings, useSettings } from "@/lib/settings";

/** Publikumsgeräusche: Applaus am Songende und Zugabe-Klatschen aus dem Browser (gilt für dieses Gerät) */
export function CrowdSoundSection() {
  // Geräte-Einstellungen erst laden – sonst würde „An“ die übrigen (Qualität, Strobo …) mit Standardwerten überschreiben
  useEffect(() => settings.getState().hydrate(), []);
  const on = useSettings((s) => s.crowdSound);
  const set = useSettings((s) => s.set);
  const chip = (active: boolean) =>
    `min-h-12 rounded-full px-5 text-lg font-semibold ${active ? "bg-white text-black" : "bg-white/10 text-white"}`;
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl bg-white/5 p-5"
      aria-labelledby="publikum"
      data-testid="crowd-sound-settings"
    >
      <h2 id="publikum" className="text-xl font-bold">
        Publikumsgeräusche
      </h2>
      <p className="text-white/70">
        Leiser Applaus mit Jubel und Pfiffen, wenn die Band sich am Songende verbeugt, und rhythmisches Klatschen vor einer Zugabe
        – direkt aus dem Browser, Spotify bleibt unverändert.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={chip(on)}
          aria-pressed={on}
          onClick={() => set({ crowdSound: true })}
          data-testid="crowd-sound-on"
        >
          An
        </button>
        <button type="button" className={chip(!on)} aria-pressed={!on} onClick={() => set({ crowdSound: false })}>
          Aus
        </button>
        <button type="button" className="min-h-12 rounded-full bg-white/10 px-5 text-lg" onClick={() => playApplause(4)}>
          ▶ Probehören
        </button>
      </div>
      <p className="text-sm text-white/50">Gilt für dieses Gerät.</p>
    </section>
  );
}
