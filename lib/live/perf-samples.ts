import type { LogEntry } from "./log-schema";

/**
 * Leistungsproben des Kiosks: alle 5 Minuten Mittel und schlechtester Wert der Bildrate (gemessen alle 2 s), dazu
 * Qualitätsstufe und Bühne. Sie laufen über das Kiosk-Protokoll (`/api/log`, Quelle „leistung“) als lesbarer Text –
 * hier geschrieben und wieder gelesen, damit /debug sie je Bühne und Stufe auswerten kann.
 */
export type PerfSample = { at: number; fps: number; minFps: number; quality: string; theme: string };

export function perfMessage(s: Omit<PerfSample, "at">, size: string): string {
  return `${s.fps} fps (min ${s.minFps}), Qualität ${s.quality}, Bühne ${s.theme}, ${size}`;
}

/** Liest eine Probe aus dem Protokoll; ältere Proben ohne Mindestwert und Bühne zählen als „?“ */
export function parsePerfSample(e: Pick<LogEntry, "source" | "message" | "at">): PerfSample | null {
  if (e.source !== "leistung") return null;
  const fps = e.message.match(/^(\d+) fps/);
  if (!fps) return null;
  const min = e.message.match(/\(min (\d+)\)/);
  return {
    at: e.at,
    fps: Number(fps[1]),
    minFps: min ? Number(min[1]) : Number(fps[1]),
    quality: e.message.match(/Qualität (\w+)/)?.[1] ?? "?",
    theme: e.message.match(/Bühne ([\w-]+)/)?.[1] ?? "?",
  };
}

export type PerfGroup = { theme: string; quality: string; samples: number; avgFps: number; minFps: number; lastAt: number };

/** Je Bühne und Stufe: Zahl der Proben, mittlere Bildrate, schlechtester Wert, letzte Probe (schwächste zuerst) */
export function summarizePerf(samples: readonly PerfSample[]): PerfGroup[] {
  const groups = new Map<string, PerfSample[]>();
  for (const s of samples) {
    const k = `${s.theme}|${s.quality}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.values()]
    .map((list) => ({
      theme: list[0]!.theme,
      quality: list[0]!.quality,
      samples: list.length,
      avgFps: Math.round(list.reduce((sum, s) => sum + s.fps, 0) / list.length),
      minFps: Math.min(...list.map((s) => s.minFps)),
      lastAt: Math.max(...list.map((s) => s.at)),
    }))
    .sort((a, b) => a.avgFps - b.avgFps);
}

/** Bewertung für die Anzeige: flüssig ab 28 fps, ruckelt sichtbar unter 20 */
export const perfGrade = (fps: number) => (fps >= 28 ? "flüssig" : fps >= 20 ? "knapp" : "ruckelt");
