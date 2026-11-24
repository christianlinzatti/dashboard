import type { EffectKind } from "@/lib/stage/themes";

export type V3 = [number, number, number];

/**
 * Partikel-Emitter. Alles wird im Vertex-Shader aus (Alter des Einsatzes, Zufallswerten) berechnet –
 * zustandslos: gleiche Songzeit → gleiches Bild (Screenshots, Vor-/Zurückspulen), kaum CPU-Last auf dem Pi.
 * mode: 0 Fontäne (Pyro, Funken), 1 Feuerwerk (Kugelbursts), 3 CO₂-Jet, 4 Sternschnuppe.
 * Konfetti und Schaum sind echte 3D-Körper (Effects3D.tsx).
 */
export type Emitter = {
  mode: 0 | 1 | 3 | 4;
  count: number;
  origins: V3[];
  life: number;
  /** Ausstoß-Fenster in s (Rest der Dauer: Partikel fliegen nur noch) */
  spawn?: number;
  speed: number;
  spread: number;
  gravity: number;
  drag: number;
  size: number;
  grow: number;
  /** Helligkeit (viele überlagerte, große Partikel würden sonst weiß ausbrennen) */
  gain?: number;
  additive: boolean;
};

export const EMITTERS: Record<Exclude<EffectKind, "ringe" | "glitzer" | "konfetti" | "schaum">, Emitter> = {
  pyro: {
    mode: 0,
    count: 1000,
    origins: [
      [-3.2, 0, -1.8],
      [3.2, 0, -1.8],
      [-1.7, 0, -2.4],
      [1.7, 0, -2.4],
    ],
    life: 1.2,
    speed: 8.5,
    spread: 0.16,
    gravity: 9.8,
    drag: 0.4,
    size: 0.16,
    grow: -0.5,
    additive: true,
  },
  funken: {
    mode: 0,
    count: 700,
    origins: [
      [-2.9, 0, 1.0],
      [2.9, 0, 1.0],
      [-3.6, 0, -0.8],
      [3.6, 0, -0.8],
    ],
    life: 1.1,
    speed: 6.2,
    spread: 0.38,
    gravity: 9.8,
    drag: 0.2,
    size: 0.06,
    grow: 0,
    additive: true,
  },
  co2: {
    mode: 3,
    count: 420,
    origins: [
      [-3.4, 0, -1.0],
      [3.4, 0, -1.0],
      [-1.2, 0, -2.4],
      [1.2, 0, -2.4],
    ],
    life: 1.5,
    speed: 13,
    spread: 0.1,
    gravity: -0.6,
    drag: 2.6,
    size: 0.55,
    grow: 2.2,
    additive: true,
  },
  // Flammenwerfer: kurze, breite Feuersäulen hinter den Tänzern
  flammen: {
    mode: 0,
    count: 420,
    origins: [
      [-3.9, 0, -1.9],
      [3.9, 0, -1.9],
      [-2.0, 0, -2.3],
      [2.0, 0, -2.3],
    ],
    life: 0.42,
    speed: 9.5,
    spread: 0.06,
    gravity: 3,
    drag: 1.6,
    size: 0.3,
    grow: 0.9,
    gain: 0.3,
    additive: true,
  },
  feuerwerk: {
    mode: 1,
    count: 1400,
    origins: [
      // seitlich neben der LED-Wand, wo der Himmel zu sehen ist
      [-6.6, 2.2, -8.5],
      [6.8, 2.8, -9],
      [-7.0, 3.2, -9.5],
      [6.4, 1.9, -8],
    ],
    life: 2.3,
    speed: 2.7,
    spread: 0,
    gravity: 1.6,
    drag: 0.9,
    size: 0.22,
    grow: -0.4,
    additive: true,
  },
  sternschnuppen: {
    mode: 4,
    count: 240,
    origins: [[0, 4, -16]],
    life: 0.9,
    speed: 16,
    spread: 0,
    gravity: 0,
    drag: 0,
    size: 0.2,
    grow: 0,
    additive: true,
  },
};
