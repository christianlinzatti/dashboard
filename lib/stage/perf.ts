import { createStore } from "zustand/vanilla";
import type { Quality } from "./quality";

/** Gemessene Bildrate der 3D-Szene (für Debug-Panel und Leistungsproben). */
export const perf = createStore<{ fps: number | null; quality: Quality | null }>()(() => ({ fps: null, quality: null }));

/** Bildrate aus Frame-Zeiten (Sekunden) – Mittel über das Fenster, robust gegen einzelne Ausreißer. */
export function fpsFrom(frameTimes: number[]): number | null {
  if (frameTimes.length < 10) return null;
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const trimmed = sorted.slice(0, Math.ceil(sorted.length * 0.95)); // obere 5 % (Hänger) nicht mitteln
  const avg = trimmed.reduce((s, x) => s + x, 0) / trimmed.length;
  return avg > 0 ? Math.round(1 / avg) : null;
}
