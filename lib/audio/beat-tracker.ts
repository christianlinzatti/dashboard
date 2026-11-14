import { estimateTempo } from "./tempo";

export type BeatState = {
  bpm: number;
  confidence: number;
  /** 0..1 innerhalb des aktuellen Schlags */
  phase: number;
  beatCount: number;
  /** Zeit (s) des letzten Schlags */
  lastBeat: number;
};

/**
 * Laufender Beat-Tracker: sammelt Onset-Werte, schätzt regelmäßig das Tempo und führt
 * ein Schlag-Raster nach (PLL), das sich sanft an die gemessene Phase anpasst.
 */
export class BeatTracker {
  private buf: Float32Array;
  private pos = 0;
  private filled = 0;
  private sinceEstimate = 0;
  private period = 0.5; // s
  private nextBeat = 0;
  private conf = 0;
  private beats = 0;
  private last = 0;
  private started = false;

  constructor(
    private frameRate = 100,
    windowSec = 8,
    private estimateEvery = 25,
  ) {
    this.buf = new Float32Array(Math.round(frameRate * windowSec));
  }

  /** Neuer Onset-Wert zur Zeit t (s). Gibt true zurück, wenn genau jetzt ein Schlag fällt. */
  push(onset: number, t: number): boolean {
    this.buf[this.pos] = onset;
    this.pos = (this.pos + 1) % this.buf.length;
    this.filled = Math.min(this.filled + 1, this.buf.length);

    if (++this.sinceEstimate >= this.estimateEvery && this.filled >= this.frameRate * 4) {
      this.sinceEstimate = 0;
      this.reestimate(t);
    }

    if (this.started && t >= this.nextBeat) {
      this.last = this.nextBeat;
      this.beats++;
      this.nextBeat += this.period;
      if (this.nextBeat < t) this.nextBeat = t + this.period; // nach Aussetzern neu ansetzen
      return true;
    }
    return false;
  }

  private ordered(): Float32Array {
    const out = new Float32Array(this.filled);
    const start = (this.pos - this.filled + this.buf.length) % this.buf.length;
    for (let i = 0; i < this.filled; i++) out[i] = this.buf[(start + i) % this.buf.length]!;
    return out;
  }

  private reestimate(t: number) {
    const est = estimateTempo(this.ordered(), this.frameRate);
    if (!est) return;
    this.conf = this.conf * 0.6 + est.confidence * 0.4;
    if (est.confidence < 0.15) return;
    const period = 60 / est.bpm;
    // Tempo gleitend übernehmen, große Sprünge direkt
    this.period = Math.abs(period - this.period) / this.period > 0.08 ? period : this.period * 0.7 + period * 0.3;
    const measuredLast = t - est.framesSinceBeat / this.frameRate;
    if (!this.started) {
      this.started = true;
      this.nextBeat = measuredLast + this.period;
      while (this.nextBeat < t) this.nextBeat += this.period;
      return;
    }
    // Phasenfehler auf ±halbe Periode falten und teilweise korrigieren
    const predictedLast = this.nextBeat - this.period;
    let err = measuredLast - predictedLast;
    err -= Math.round(err / this.period) * this.period;
    this.nextBeat += err * 0.25;
  }

  state(t: number): BeatState {
    const phase = this.started ? ((((t - (this.nextBeat - this.period)) / this.period) % 1) + 1) % 1 : 0;
    return { bpm: 60 / this.period, confidence: this.conf, phase, beatCount: this.beats, lastBeat: this.last };
  }

  reset() {
    this.buf.fill(0);
    this.pos = this.filled = this.sinceEstimate = this.beats = 0;
    this.conf = 0;
    this.started = false;
  }
}
