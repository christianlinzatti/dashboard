/**
 * Tempo-Schätzung aus einer Onset-Hüllkurve (z. B. 100 Werte/s über 8 s):
 * Autokorrelation im Bereich 70–180 BPM, Oberton-Verstärkung und eine sanfte Vorliebe für
 * ~120 BPM gegen Oktavfehler (Halb-/Doppeltempo). Die Phase gibt an, wann der letzte Schlag war.
 */
export type TempoEstimate = {
  bpm: number;
  /** 0..1 – wie deutlich der Puls ist */
  confidence: number;
  /** Frames seit dem letzten Schlag (bezogen auf das Ende der Hüllkurve) */
  framesSinceBeat: number;
};

export function estimateTempo(
  env: ArrayLike<number>,
  frameRate: number,
  range: [number, number] = [70, 180],
): TempoEstimate | null {
  const n = env.length;
  if (n < frameRate * 3) return null;

  // Mittelwert abziehen, nur positive Anteile (Onsets)
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[i]!;
  mean /= n;
  const x = new Float32Array(n);
  let energy = 0;
  for (let i = 0; i < n; i++) {
    x[i] = Math.max(env[i]! - mean, 0);
    energy += x[i]! * x[i]!;
  }
  if (energy <= 1e-12) return null;

  const minLag = Math.max(2, Math.floor((60 * frameRate) / range[1]));
  const maxLag = Math.min(Math.floor(n / 2), Math.ceil((60 * frameRate) / range[0]));
  const ac = new Float32Array(2 * maxLag + 2);
  for (let lag = 1; lag < ac.length && lag < n; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += x[i]! * x[i - lag]!;
    ac[lag] = s / (n - lag);
  }

  let best = -1;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * frameRate) / lag;
    // Oberton: echter Puls korreliert auch beim doppelten Abstand
    const harmonic = ac[lag]! + 0.5 * (ac[2 * lag] ?? 0);
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2));
    const score = harmonic * prior;
    if (score > bestScore) {
      bestScore = score;
      best = lag;
    }
  }
  if (best < 0) return null;

  // Parabolische Interpolation für Sub-Frame-Genauigkeit
  const y0 = ac[best - 1] ?? ac[best]!;
  const y1 = ac[best]!;
  const y2 = ac[best + 1] ?? ac[best]!;
  const denom = y0 - 2 * y1 + y2;
  const delta = denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0;
  const period = best + delta;
  const bpm = (60 * frameRate) / period;

  // Phase: Kammfilter über die Hüllkurve, rückwärts vom Ende
  const p = Math.round(period);
  let bestPhase = 0;
  let bestSum = -Infinity;
  for (let phi = 0; phi < p; phi++) {
    let s = 0;
    for (let k = n - 1 - phi; k >= 0; k -= period) s += x[Math.round(k)] ?? 0;
    if (s > bestSum) {
      bestSum = s;
      bestPhase = phi;
    }
  }

  // Sicherheit = wie stark der Puls über der mittleren Korrelation liegt (Rauschen ≈ 0)
  const ac0 = energy / n;
  let acMean = 0;
  for (let lag = minLag; lag <= maxLag; lag++) acMean += ac[lag]!;
  acMean /= maxLag - minLag + 1;
  const confidence = (y1 - acMean) / Math.max(ac0 - acMean, 1e-12);
  return { bpm, confidence: Math.max(0, Math.min(1, confidence)), framesSinceBeat: bestPhase };
}
