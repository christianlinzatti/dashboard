"use client";

import { useEffect, useState } from "react";
import { screenOff, type QuietHours } from "@/lib/live/quiet-hours";
import { useSongContext } from "@/lib/song-context/store";
import { displayPower } from "@/lib/live/display-power";
import { screenStore } from "@/lib/live/screen";
import { useStore } from "zustand";

/** Wie oft die Ruhezeit-Einstellung neu geholt wird (am Handy geändert → gilt spätestens dann) */
const RELOAD_MS = 15 * 60_000;

/** Ruhezeit aus den Einstellungen (pro Spotify-Konto); in Demos nur über die Adresse */
function useQuietHours(enabled: boolean, forced: QuietHours | undefined) {
  const [q, setQ] = useState<QuietHours | null>(forced ?? null);
  useEffect(() => {
    if (!enabled || forced) return;
    let alive = true;
    const load = () =>
      fetch("/api/prefs", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ quietHours?: QuietHours | null }>) : null))
        .then((d) => alive && d && setQ(d.quietHours ?? null))
        .catch(() => undefined);
    void load();
    const id = setInterval(load, RELOAD_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [enabled, forced]);
  return q;
}

/**
 * Display-Zeitplan: schwarzer Bildschirm in der Ruhezeit, solange keine Musik läuft. Antippen weckt für fünf
 * Minuten; startet Musik, ist sofort alles wieder da.
 */
export function QuietHoursOverlay({ enabled, forced }: { enabled: boolean; forced?: QuietHours }) {
  const q = useQuietHours(enabled, forced);
  const playing = useSongContext((s) => !!s.song && s.playback.isPlaying);
  const [wokeAt, setWokeAt] = useState<number | null>(null);
  // Uhrzeit erst nach dem Einhängen lesen: der Server rendert mit seiner eigenen Uhr (andere Zeitzone), und React
  // gleicht abweichende Attribute beim Hydrieren nicht an
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!q) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [q]);
  // von Hand (Fernbedienung, Alexa): „Bildschirm aus“ bis zum Antippen bzw. „an“
  const manualOff = useStore(screenStore, (s) => s.manualOff);
  const remoteWoke = useStore(screenStore, (s) => s.wokeAt);
  const woke = Math.max(wokeAt ?? 0, remoteWoke ?? 0) || null;
  const off = manualOff || (now !== null && screenOff(q, new Date(now), playing, woke));
  // an die Pi-Bridge weitergeben (schaltet per HDMI ab, wenn eingerichtet)
  useEffect(() => displayPower.getState().set(!off), [off]);
  useEffect(() => () => displayPower.getState().set(true), []);
  if (!q && !manualOff) return null;
  return (
    <div
      className="absolute inset-0 z-[70] bg-black transition-opacity duration-[2000ms]"
      style={{ opacity: off ? 1 : 0, pointerEvents: off ? "auto" : "none" }}
      onPointerDown={() => {
        setWokeAt(Date.now());
        setNow(Date.now());
        screenStore.getState().set(true);
      }}
      data-testid="quiet-hours"
      data-off={off}
      aria-hidden={!off}
    />
  );
}
