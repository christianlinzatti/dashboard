import { createStore } from "zustand/vanilla";
import type { Quality } from "./quality";

/**
 * Anpassbare Auflösung: Reicht die Bildrate nicht, rendert die Bühne zuerst mit weniger Pixeln (bis 60 % der vollen
 * Auflösung) – das kostet kaum Bild, entlastet die Grafik aber stark, gerade auf Notebooks mit hochauflösendem
 * Bildschirm, wo die Pixelmenge bremst und nicht die Szene. Erst wenn das nicht reicht, geht die automatische
 * Qualität eine Stufe herunter.
 */

/** so weit wird die Auflösung höchstens gesenkt (Anteil der vollen) */
export const MIN_RESOLUTION = 0.6;
/** Schritt je Messung (2,5 s) */
export const RESOLUTION_STEP = 0.2;
/** unterhalb davon (und automatischer Qualität) eine Qualitätsstufe herunter */
export const QUALITY_DOWN_BELOW = 0.45;
/** nach dem Herunterschalten: Auflösung wieder ein Stück anheben (die niedrigere Stufe ist günstiger) */
export const AFTER_QUALITY_DOWN = 0.8;

/** volle Pixeldichte: die des Geräts, höchstens die der Stufe */
export function maxDpr(preset: readonly [number, number], deviceRatio: number): number {
  return Math.max(preset[0], Math.min(preset[1], deviceRatio || 1));
}

/** Pixeldichte für den Regelfaktor 0..1 (1 = volle Auflösung), auf 0,05 gerundet */
export function stageDpr(preset: readonly [number, number], deviceRatio: number, factor: number): number {
  const max = maxDpr(preset, deviceRatio);
  const f = Math.min(1, Math.max(0, factor));
  const dpr = max * (MIN_RESOLUTION + (1 - MIN_RESOLUTION) * f);
  return Math.round(dpr * 20) / 20;
}

/** Anteil der vollen Auflösung (für Debug-Anzeige), in Prozent */
export const resolutionPercent = (factor: number) =>
  Math.round((MIN_RESOLUTION + (1 - MIN_RESOLUTION) * Math.min(1, Math.max(0, factor))) * 100);

export type PerfStep = { factor: number; quality: "runter" | "hinauf" | null };

/**
 * Was bei zu niedriger Bildrate passiert: Der Monitor hat den Faktor schon gesenkt. Ist er unten angekommen und die
 * Qualität automatisch, eine Stufe herunter – danach die Auflösung wieder anheben.
 */
export function onDecline(factor: number, auto: boolean, quality: Quality): PerfStep {
  if (auto && factor < QUALITY_DOWN_BELOW && quality !== "niedrig") return { factor: AFTER_QUALITY_DOWN, quality: "runter" };
  return { factor, quality: null };
}

/** Bildrate reicht gut: erst volle Auflösung, dann (automatisch) eine Stufe hinauf */
export function onIncline(factor: number, auto: boolean, quality: Quality, wasFull: boolean): PerfStep {
  if (auto && wasFull && quality !== "hoch") return { factor, quality: "hinauf" };
  return { factor, quality: null };
}

/**
 * Stand der Anpassung – über Songwechsel hinweg (die Szene wird je Song neu aufgebaut; ohne das lernte ein schwacher
 * Rechner bei jedem Song von vorn und ruckelte bis dahin).
 */
export const adaptive = createStore<{ quality: Quality; factor: number }>()(() => ({ quality: "mittel", factor: 1 }));
