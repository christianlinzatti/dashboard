import { createStore } from "zustand/vanilla";
import type { Quality } from "./quality";

/** Gemessene Bildrate der 3D-Szene (für Debug-Panel und Leistungsproben). */
export const perf = createStore<{
  fps: number | null;
  quality: Quality | null;
  /** Anteil der vollen Auflösung in Prozent (sinkt, wenn die Bildrate nicht reicht) */
  resolution?: number;
}>()(() => ({ fps: null, quality: null }));

/**
 * Bildrate aus Frame-Zeiten (Sekunden) – Mittel über das Fenster, robust gegen einzelne Ausreißer.
 * Schon ab drei Bildern: gerade ein ruckelnder Pi (2–4 fps) muss seine Bildrate melden; ab zehn Bildern
 * werden Hänger herausgerechnet, darunter wäre das zu ungenau.
 */
export function fpsFrom(frameTimes: number[]): number | null {
  if (frameTimes.length < 3) return null;
  if (frameTimes.length < 10) {
    const avg = frameTimes.reduce((s, x) => s + x, 0) / frameTimes.length;
    return avg > 0 ? Math.max(1, Math.round(1 / avg)) : null;
  }
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const trimmed = sorted.slice(0, Math.ceil(sorted.length * 0.95)); // obere 5 % (Hänger) nicht mitteln
  const avg = trimmed.reduce((s, x) => s + x, 0) / trimmed.length;
  return avg > 0 ? Math.round(1 / avg) : null;
}
