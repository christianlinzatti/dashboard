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
  /** Anteil der Partikel bei Spezialeffekten (Pyro, Konfetti, Feuerwerk …) */
  particles: number;
  /** Publikum: höchste Zahl an Silhouetten (× Dichte der Bühne) */
  crowd: number;
  /** Live-Bildschirme an der LED-Wand: Bildbreite der zweiten Kamera und jedes wievielte Bild neu gefilmt wird (null = aus) */
  liveScreens: { width: number; every: number } | null;
};

export const PRESETS: Record<Quality, QualityPreset> = {
  niedrig: {
    heads: 2,
    realLights: 0,
    bloom: false,
    reflector: false,
    fog: false,
    lasers: 4,
    dpr: [1, 1],
    particles: 0.35,
    crowd: 140,
    liveScreens: null,
  },
  mittel: {
    heads: 4,
    realLights: 2,
    bloom: true,
    reflector: false,
    fog: true,
    lasers: 6,
    dpr: [1, 1.25],
    particles: 0.65,
    crowd: 300,
    liveScreens: { width: 384, every: 2 },
  },
  hoch: {
    heads: 6,
    realLights: 4,
    bloom: true,
    reflector: true,
    fog: true,
    lasers: 10,
    dpr: [1, 1.5],
    particles: 1,
    crowd: 520,
    liveScreens: { width: 512, every: 1 },
  },
};

export function stepQuality(q: Quality, dir: 1 | -1): Quality {
  const i = qualities.indexOf(q) + dir;
  return qualities[Math.min(Math.max(i, 0), qualities.length - 1)]!;
}
