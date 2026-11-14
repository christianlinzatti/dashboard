/** Qualitätsstufen der Bühne – Pi 4 → niedrig, Pi 5 → mittel, Mini-PC (N100) → hoch. */
export const qualities = ["niedrig", "mittel", "hoch"] as const;
export type Quality = (typeof qualities)[number];

export type QualityPreset = {
  /** Anzahl Moving Heads (Lichtkegel) */
  heads: number;
  /** davon mit echtem Three.js-Spotlight (teuer) – Rest nur sichtbare Kegel */
  realLights: number;
  bloom: boolean;
  /** spiegelnder Boden */
  reflector: boolean;
  fog: boolean;
  lasers: number;
  dpr: [number, number];
};

export const PRESETS: Record<Quality, QualityPreset> = {
  niedrig: { heads: 2, realLights: 0, bloom: false, reflector: false, fog: false, lasers: 4, dpr: [1, 1] },
  mittel: { heads: 4, realLights: 2, bloom: true, reflector: false, fog: true, lasers: 6, dpr: [1, 1.25] },
  hoch: { heads: 6, realLights: 4, bloom: true, reflector: true, fog: true, lasers: 10, dpr: [1, 1.5] },
};

export function stepQuality(q: Quality, dir: 1 | -1): Quality {
  const i = qualities.indexOf(q) + dir;
  return qualities[Math.min(Math.max(i, 0), qualities.length - 1)]!;
}
