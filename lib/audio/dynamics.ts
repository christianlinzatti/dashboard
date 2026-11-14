import { clamp01, smooth } from "./features";

/**
 * Lautheits-Normalisierung (automatische Pegelanpassung): Energie 0..1 relativ zum
 * Pegel der letzten ~20 s – funktioniert unabhängig von Lautstärke und Mikro-Abstand.
 */
export class EnergyMeter {
  private hi = -60;
  private lo = -60;
  private short = 0;
  private long = 0;
  private init = false;

  push(db: number, dt: number) {
    if (!this.init) {
      this.hi = db + 6;
      this.lo = db - 20;
      this.init = true;
    }
    // Hüllkurven: Maximum fällt langsam, Minimum steigt langsam
    this.hi = db > this.hi ? db : this.hi - dt * 0.4;
    this.lo = db < this.lo ? db : this.lo + dt * 0.4;
    if (this.hi - this.lo < 18) this.lo = this.hi - 18;
    const e = clamp01((db - this.lo) / (this.hi - this.lo));
    this.short = smooth(this.short, e, dt, 0.25);
    this.long = smooth(this.long, e, dt, 8);
    return { energy: this.short, longEnergy: this.long };
  }
}

/**
 * Drop-Erkennung: nach einer ruhigeren Phase (Break/Build-up) kommt die Energie
 * mit Bass schlagartig zurück. Mindestabstand zwischen Drops: 15 s.
 */
export class DropDetector {
  private quiet = 0; // s ruhige Phase
  private lastDrop = -Infinity;
  private bass = 0;

  push(energy: number, longEnergy: number, bassRatio: number, t: number, dt: number): boolean {
    this.bass = smooth(this.bass, bassRatio, dt, 0.15);
    if (energy < Math.max(0.45, longEnergy * 0.8)) this.quiet += dt;
    else if (energy > 0.65) {
      const drop = this.quiet >= 2 && energy > longEnergy + 0.15 && this.bass > 0.3 && t - this.lastDrop > 15;
      this.quiet = 0;
      if (drop) {
        this.lastDrop = t;
        return true;
      }
    }
    return false;
  }
}
