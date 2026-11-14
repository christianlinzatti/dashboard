/**
 * Tempo-Einrasten für die Tanz-Planung: erst wenn das gemessene Tempo einige Sekunden stabil ist,
 * wird es übernommen (und dann nur bei deutlicher, anhaltender Abweichung neu gesetzt).
 * So wird die Choreografie pro Song höchstens selten neu geplant.
 */
export class TempoLock {
  private candidate = 0;
  private stableFor = 0;
  locked: number | null = null;

  constructor(private opts = { minConfidence: 0.3, lockAfterS: 4, relockAfterS: 8, tolerance: 0.02, relockDeviation: 0.06 }) {}

  /** Gibt das neu eingerastete Tempo zurück (sonst null). */
  push(bpm: number, confidence: number, dt: number): number | null {
    if (confidence < this.opts.minConfidence || !Number.isFinite(bpm) || bpm <= 0) {
      this.stableFor = 0;
      return null;
    }
    if (this.candidate && Math.abs(bpm - this.candidate) / this.candidate < this.opts.tolerance) {
      this.stableFor += dt;
      this.candidate = this.candidate * 0.95 + bpm * 0.05;
    } else {
      this.candidate = bpm;
      this.stableFor = 0;
    }
    const value = Math.round(this.candidate * 2) / 2; // halbe BPM reichen
    if (this.locked === null && this.stableFor >= this.opts.lockAfterS) return (this.locked = value);
    if (
      this.locked !== null &&
      Math.abs(this.candidate - this.locked) / this.locked > this.opts.relockDeviation &&
      this.stableFor >= this.opts.relockAfterS
    ) {
      return (this.locked = value);
    }
    return null;
  }

  reset() {
    this.candidate = 0;
    this.stableFor = 0;
    this.locked = null;
  }
}

/**
 * Raster-Anker in Songzeit: wird bei jedem erkannten Schlag sanft nachgeführt.
 * Korrekturen werden auf ±½ Tanz-Schlag gefaltet, damit die Pose nie um einen ganzen Schlag springt.
 */
export function updateAnchor(anchor: number | null, beatSongMs: number, danceBeatMs: number, gain = 0.3): number {
  if (anchor === null) return beatSongMs;
  let err = beatSongMs - anchor;
  err -= Math.round(err / danceBeatMs) * danceBeatMs;
  return anchor + err * gain;
}

/** Bei doppelt so langen Tanz-Schlägen nur jeden zweiten gemessenen Schlag verwenden. */
export function beatStride(danceBeatMs: number, measuredBeatMs: number) {
  return Math.max(1, Math.round(danceBeatMs / measuredBeatMs));
}
