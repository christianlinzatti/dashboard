/** Frequenzbänder (Hz): Sub-Bass, Bass, Low-Mid, Mid, High, Air */
export const BANDS: ReadonlyArray<readonly [number, number]> = [
  [20, 60],
  [60, 250],
  [250, 500],
  [500, 2000],
  [2000, 6000],
  [6000, 16000],
];

/** Mittlere lineare Leistung je Band aus einem dB-Spektrum (AnalyserNode.getFloatFrequencyData). */
export function bandPowers(db: ArrayLike<number>, sampleRate: number, fftSize: number): number[] {
  const binHz = sampleRate / fftSize;
  return BANDS.map(([lo, hi]) => {
    const a = Math.max(1, Math.floor(lo / binHz));
    const b = Math.min(db.length - 1, Math.ceil(hi / binHz));
    let sum = 0;
    for (let i = a; i <= b; i++) sum += Math.pow(10, Math.max(db[i]!, -140) / 10);
    return sum / Math.max(b - a + 1, 1);
  });
}

/**
 * Spectral Flux: Summe der positiven Änderungen des log-Spektrums zum vorherigen Frame.
 * Bass wird stärker gewichtet (Kick-Drum = Beat).
 */
export function spectralFlux(db: ArrayLike<number>, prev: Float32Array, sampleRate: number, fftSize: number): number {
  const binHz = sampleRate / fftSize;
  const maxBin = Math.min(db.length, Math.floor(8000 / binHz));
  let flux = 0;
  for (let i = 1; i < maxBin; i++) {
    const v = Math.max(db[i]!, -100);
    const d = v - prev[i]!;
    if (d > 0) flux += d * (i * binHz < 200 ? 2.5 : 1);
    prev[i] = v;
  }
  return flux / maxBin;
}

export function toDb(power: number) {
  return 10 * Math.log10(Math.max(power, 1e-14));
}

export function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Exponentielle Glättung mit Zeitkonstante tau (s) bei Schrittweite dt (s). */
export function smooth(prev: number, next: number, dt: number, tau: number) {
  const a = 1 - Math.exp(-dt / Math.max(tau, 1e-6));
  return prev + (next - prev) * a;
}
