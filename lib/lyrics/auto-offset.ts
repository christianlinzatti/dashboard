import type { LyricLine } from "@/lib/song-context/schema";

/**
 * Lyrics-Versatz automatisch (Mikrofon): Wann beginnt hörbar Gesang, und wann sollte laut Lyrics die Zeile
 * beginnen? Der Unterschied über viele Zeilen ergibt den Versatz. Gemessen wird in der Songzeit von Spotify (ohne den
 * aktuell eingestellten Versatz) – die Messung hängt also nicht von der eigenen Korrektur ab (keine Rückkopplung).
 *
 * - kleine Abweichung (unter SONG_SHIFT_MS): Verzögerung der Lautsprecher (Bluetooth, Receiver) – gilt für dieses
 *   Gerät und wird langsam gelernt (höchstens DEVICE_STEP_MS je Schätzung)
 * - große Abweichung: dieser Song ist verschoben (andere Version, längeres Intro) – gilt nur für ihn und wird im
 *   Song-Gedächtnis gemerkt
 */

/** Ab dieser Abweichung gilt eine Verschiebung als songeigen statt als Lautsprecher-Verzögerung */
export const SONG_SHIFT_MS = 800;
/** So weit bewegt sich die Lautsprecher-Verzögerung je Schätzung höchstens */
export const DEVICE_STEP_MS = 150;
/** Grenzen der gelernten Lautsprecher-Verzögerung */
export const DEVICE_LIMIT_MS = 1500;
/** Grenzen der songeigenen Verschiebung */
export const SONG_LIMIT_MS = 15_000;
/** Mindestzahl passender Einsätze und höchste Streuung (mittlere absolute Abweichung) für eine Schätzung */
export const MIN_MATCHES = 6;
export const MAX_SPREAD_MS = 350;
/** Die Stimmerkennung reagiert geglättet etwas später als der echte Einsatz */
export const VOCAL_ONSET_BIAS_MS = 60;

/**
 * Gesangseinsätze aus dem Stimmpegel (0..1): Pegel steigt über `on`, nachdem er mindestens `quietMs` unter `off` lag.
 * So zählen nur Einsätze nach einer Pause – die passen eindeutig zu einem Zeilenanfang.
 */
export class VocalOnsets {
  private quietSince: number | null = null;
  private armed = false;
  constructor(
    private readonly on = 0.35,
    private readonly off = 0.15,
    private readonly quietMs = 400,
  ) {}

  push(level: number, t: number): boolean {
    if (level < this.off) {
      this.quietSince ??= t;
      if (t - this.quietSince >= this.quietMs) this.armed = true;
      return false;
    }
    this.quietSince = null;
    if (this.armed && level >= this.on) {
      this.armed = false;
      return true;
    }
    return false;
  }
}

/** Zeilenanfänge nach einer Pause (die vorige Zeile endete mindestens `gapMs` vorher) – nur die taugen zum Vergleich */
export function cueStarts(lines: readonly Pick<LyricLine, "startMs" | "endMs">[], gapMs = 600): number[] {
  return lines.filter((l, i) => i === 0 || l.startMs - lines[i - 1]!.endMs >= gapMs).map((l) => l.startMs);
}

/**
 * Einen gehörten Einsatz (Songzeit) dem nächsten passenden Zeilenanfang zuordnen – gesucht um den bisher erwarteten
 * Versatz herum. Liefert den gemessenen Versatz (Einsatz − Zeilenanfang) oder null.
 */
export function matchOnset(onsetMs: number, starts: readonly number[], expectedMs: number, windowMs = 2500): number | null {
  let best: number | null = null;
  for (const s of starts) {
    const d = onsetMs - s;
    if (Math.abs(d - expectedMs) > windowMs) continue;
    if (best === null || Math.abs(d - expectedMs) < Math.abs(best - expectedMs)) best = d;
  }
  return best;
}

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Schätzung aus den gemessenen Versätzen: Median, wenn genug davon übereinstimmen */
export function estimate(diffs: readonly number[]): { offsetMs: number; spreadMs: number; n: number } | null {
  if (diffs.length < MIN_MATCHES) return null;
  const m = median(diffs);
  const spread = median(diffs.map((d) => Math.abs(d - m)));
  if (spread > MAX_SPREAD_MS) return null;
  return { offsetMs: Math.round(m), spreadMs: Math.round(spread), n: diffs.length };
}

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

/**
 * Schätzung aufteilen: manuell eingestellt bleibt, wie es ist. Liegt der Rest nahe der bisherigen
 * Lautsprecher-Verzögerung, wird diese ein Stück nachgezogen; liegt er weit daneben, ist der Song verschoben.
 */
export function splitOffset(estimateMs: number, current: { manual: number; device: number }): { device: number; song: number } {
  const residual = estimateMs - current.manual - current.device;
  if (Math.abs(residual) >= SONG_SHIFT_MS) return { device: current.device, song: clamp(Math.round(residual), SONG_LIMIT_MS) };
  const step = clamp(residual * 0.5, DEVICE_STEP_MS);
  return { device: clamp(Math.round((current.device + step) / 10) * 10, DEVICE_LIMIT_MS), song: 0 };
}
