/**
 * Schlagzeug aus dem Mikrofon heraushören: Einsätze (Onsets) getrennt nach Frequenzbereich – Bassdrum (tief),
 * Snare (Körper um 200 Hz plus Rauschen 2–5 kHz) und Hi-Hat (sehr hoch). Je Bereich die positive Änderung des
 * log-Spektrums gegenüber dem letzten Frame (Spectral Flux), verglichen mit dem eigenen gleitenden Mittel und der
 * Streuung – so funktioniert es unabhängig von Lautstärke und Mikrofon-Abstand. Nach einem Treffer ist der Bereich
 * kurz taub (keine Doppel-Treffer aus einem Schlag).
 */
export type DrumKind = "kick" | "snare" | "hat";
export type DrumOnsets = Record<DrumKind, boolean>;

type Range = readonly [number, number];
const RANGES: Record<DrumKind, readonly Range[]> = {
  kick: [[40, 120]],
  snare: [
    [160, 320],
    [2000, 5000],
  ],
  hat: [[7000, 14000]],
};
/** Mindestabstand zweier Treffer (s): Bassdrum/Snare höchstens Sechzehntel bei 180 BPM, Hi-Hat schneller */
const REFRACTORY: Record<DrumKind, number> = { kick: 0.09, snare: 0.09, hat: 0.05 };
/** Wie weit über dem Mittel (in Streuungen) ein Einsatz liegen muss */
const SENSITIVITY: Record<DrumKind, number> = { kick: 2.2, snare: 2.4, hat: 2.6 };

/** Mindestens so viel (dB im Mittel über den Bereich) muss der Pegel springen – Rauschen und Hall bleiben darunter */
const MIN_RISE_DB = 3;

class Onset {
  private mean = 0;
  private dev = 1;
  private last = -Infinity;
  private warm = 0;
  constructor(
    private readonly k: number,
    private readonly refractory: number,
  ) {}

  push(flux: number, t: number, dt: number): boolean {
    // gleitendes Mittel und mittlere Abweichung über ~0,5 s
    const a = Math.min(1, dt / 0.5);
    const hit = this.warm > 0.5 && flux > this.mean + this.k * this.dev && flux > MIN_RISE_DB && t - this.last >= this.refractory;
    this.mean += (flux - this.mean) * a;
    this.dev += (Math.abs(flux - this.mean) - this.dev) * a;
    this.warm += dt;
    if (hit) this.last = t;
    return hit;
  }
}

export class DrumDetector {
  private prev: Float32Array | null = null;
  private readonly onsets: Record<DrumKind, Onset> = {
    kick: new Onset(SENSITIVITY.kick, REFRACTORY.kick),
    snare: new Onset(SENSITIVITY.snare, REFRACTORY.snare),
    hat: new Onset(SENSITIVITY.hat, REFRACTORY.hat),
  };

  /** Ein Frame: dB-Spektrum (AnalyserNode), Audio-Zeit t (s), Abstand dt (s) */
  push(db: ArrayLike<number>, sampleRate: number, fftSize: number, t: number, dt: number): DrumOnsets {
    const binHz = sampleRate / fftSize;
    if (!this.prev || this.prev.length !== db.length) {
      this.prev = Float32Array.from(db, (v) => Math.max(v, -100));
      return { kick: false, snare: false, hat: false };
    }
    const flux = (ranges: readonly Range[]) => {
      let sum = 0;
      let n = 0;
      for (const [lo, hi] of ranges) {
        const a = Math.max(1, Math.floor(lo / binHz));
        const b = Math.min(db.length - 1, Math.ceil(hi / binHz));
        for (let i = a; i <= b; i++) {
          const d = Math.max(db[i]!, -100) - this.prev![i]!;
          if (d > 0) sum += d;
          n++;
        }
      }
      return n ? sum / n : 0;
    };
    const out = {
      kick: this.onsets.kick.push(flux(RANGES.kick), t, dt),
      snare: this.onsets.snare.push(flux(RANGES.snare), t, dt),
      hat: this.onsets.hat.push(flux(RANGES.hat), t, dt),
    };
    for (let i = 0; i < db.length; i++) this.prev[i] = Math.max(db[i]!, -100);
    return out;
  }
}
