"use client";

import { useState } from "react";
import type { QuietHours } from "@/lib/live/quiet-hours";

type Save = (patch: { quietHours: QuietHours | null }, done: string) => void;

/** Display-Zeitplan: Bildschirm nachts schwarz, solange keine Musik läuft */
export function QuietHoursSection({ value, busy, save }: { value: QuietHours | null; busy: boolean; save: Save }) {
  const [from, setFrom] = useState(value?.from ?? "23:00");
  const [to, setTo] = useState(value?.to ?? "07:00");
  const chip = (active: boolean) =>
    `min-h-12 rounded-full px-5 text-lg font-semibold ${active ? "bg-white text-black" : "bg-white/10 text-white"} disabled:opacity-50`;
  const input = "min-h-12 rounded-xl bg-white/10 px-3 text-lg [color-scheme:dark]";
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl bg-white/5 p-5"
      aria-labelledby="ruhezeit"
      data-testid="quiet-hours-settings"
    >
      <h2 id="ruhezeit" className="text-xl font-bold">
        Bildschirm nachts aus
      </h2>
      <p className="text-lg" data-testid="quiet-hours-current">
        {value ? `Ruhezeit ${value.from}–${value.to} Uhr` : "Aus – der Bildschirm bleibt immer an"}
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (from !== to) save({ quietHours: { from, to } }, `Ruhezeit ${from}–${to} Uhr gespeichert.`);
        }}
      >
        <label className="flex flex-col gap-1 text-sm text-white/70">
          von
          <input
            type="time"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={input}
            data-testid="quiet-from"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-white/70">
          bis
          <input
            type="time"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={input}
            data-testid="quiet-to"
            required
          />
        </label>
        <button type="submit" className={chip(false)} disabled={busy || from === to} data-testid="quiet-save">
          {value ? "Ändern" : "Einschalten"}
        </button>
        {value && (
          <button
            type="button"
            className="min-h-12 px-2 text-white/70 underline"
            disabled={busy}
            onClick={() => save({ quietHours: null }, "Ruhezeit ausgeschaltet.")}
            data-testid="quiet-off"
          >
            Ausschalten
          </button>
        )}
      </form>
      <p className="text-sm text-white/50">
        In der Ruhezeit wird der Bildschirm schwarz, solange keine Musik läuft – läuft ein Song, gibt es die Show wie immer.
        Antippen weckt ihn für fünf Minuten. Gilt auf allen Bildschirmen mit diesem Spotify-Konto (spätestens nach 15 Minuten).
      </p>
    </section>
  );
}
