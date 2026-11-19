import type { Section, SectionKind } from "@/lib/song-context/schema";

/**
 * Abschnitte ohne Lyrics aus dem gemessenen Energieverlauf (Song-Gedächtnis): Techno, Instrumentals und Songs ohne
 * gefundene Lyrics bekommen eine echte Dramaturgie statt einer geschätzten – ruhiger Anfang (Intro), Anstieg
 * (Aufbau), volle Energie (Drop/Höhepunkt → wie ein Refrain), Einbruch in der Mitte (Breakdown → wie eine Bridge),
 * mittlere Energie (Strophe/Groove) und ruhiges Ende (Outro). Grenzen liegen auf dem 8-Takt-Raster.
 */

/** Ein Wert je so vielen ms (der Kiosk mittelt die Mikrofon-Energie darüber) */
export const ENERGY_BIN_MS = 2000;
/** Werte 0..100 (Energie × 100), höchstens so viele (≈ 24 min) */
export const MAX_ENERGY_BINS = 720;

type Level = "low" | "mid" | "high";

const smooth = (xs: readonly number[], radius: number) =>
  xs.map((_, i) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(xs.length - 1, i + radius); j++) {
      sum += xs[j]!;
      n++;
    }
    return sum / n;
  });

const quantile = (xs: readonly number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!;
};

/**
 * Abschnitte aus dem Energieverlauf; null, wenn der Verlauf zu kurz ist oder kaum schwankt (dann bleibt die Schätzung
 * nach der Songlänge).
 */
export function sectionsFromEnergy(
  energy: readonly number[],
  durationMs: number,
  barMs: number,
  binMs = ENERGY_BIN_MS,
): Section[] | null {
  const blockMs = 8 * barMs;
  const blocks = Math.ceil(durationMs / blockMs);
  if (energy.length * binMs < durationMs * 0.6 || blocks < 4) return null;
  const e = smooth(energy, 2);
  const lo = quantile(e, 0.1);
  const hi = quantile(e, 0.9);
  if (hi - lo < 8) return null; // gleichförmig: nichts zu erkennen
  // je 8-Takt-Block: mittlere Energie, eingeordnet in leise / mittel / laut
  const levels: Level[] = [];
  for (let b = 0; b < blocks; b++) {
    const from = Math.floor((b * blockMs) / binMs);
    const to = Math.max(from + 1, Math.floor(((b + 1) * blockMs) / binMs));
    const part = e.slice(from, Math.min(to, e.length));
    const v = part.length ? (part.reduce((a, x) => a + x, 0) / part.length - lo) / (hi - lo) : 0;
    levels.push(v >= 0.62 ? "high" : v <= 0.32 ? "low" : "mid");
  }
  const firstHigh = levels.indexOf("high");
  const lastHigh = levels.lastIndexOf("high");
  const kinds: SectionKind[] = levels.map((l, b) => {
    if (l === "high") return "chorus";
    if (firstHigh < 0 || b < firstHigh) {
      // vor dem ersten Höhepunkt: leise = Intro, der Block direkt davor = Aufbau
      if (b === firstHigh - 1) return "prechorus";
      return l === "low" ? "intro" : "verse";
    }
    if (b > lastHigh) return l === "low" || b === blocks - 1 ? "outro" : "verse";
    // zwischen Höhepunkten: Einbruch = Breakdown, Block vor dem nächsten Höhepunkt = Aufbau
    if (levels[b + 1] === "high") return "prechorus";
    return l === "low" ? "bridge" : "verse";
  });
  // Intro nur am Anfang: ein „Intro“ nach Strophen wird zur Strophe
  for (let b = 1; b < kinds.length; b++) if (kinds[b] === "intro" && kinds[b - 1] !== "intro") kinds[b] = "verse";
  // gleiche Nachbarn zusammenfassen
  const out: Section[] = [];
  kinds.forEach((kind, b) => {
    const startMs = b * blockMs;
    const endMs = Math.min(durationMs, (b + 1) * blockMs);
    const last = out.at(-1);
    if (last && last.kind === kind) last.endMs = endMs;
    else out.push({ kind, startMs, endMs });
  });
  return out;
}

/** Neue Messung einrechnen: bei gleicher Länge gemittelt (gewichtet nach Zahl der Messungen), sonst ersetzt */
export function mergeEnergy(prev: readonly number[] | undefined, seen: number, next: readonly number[]): number[] {
  if (!prev || Math.abs(prev.length - next.length) > 2) return next.map((v) => Math.round(v));
  return next.map((v, i) => Math.round(((prev[i] ?? v) * seen + v) / (seen + 1)));
}
