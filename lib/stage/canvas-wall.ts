import type { LightScene } from "./lights";

/** Fläche der LED-Wand (wie das Wandfoto) */
export const WALL_W = 10;
export const WALL_H = 4.4;

/** Helligkeit des Canvas je Lichtszene: kräftiger als das Duoton-Foto, im Drop etwas zurück (Strobo, Laser) */
export const CANVAS_VISIBILITY: Record<LightScene, number> = {
  intro: 0.95,
  outro: 0.9,
  bridge: 0.85,
  instrumental: 0.9,
  strophe: 0.8,
  refrain: 0.85,
  drop: 0.6,
  applaus: 0.9,
  aufbau: 0.3,
};

type Crop = { repeat: [number, number]; offset: [number, number] };

/** Bildausschnitt, der eine Fläche mit Seitenverhältnis `target` ganz füllt (wie CSS object-fit: cover) */
export function coverCrop(aspect: number, target: number): Crop {
  const repeat: [number, number] = aspect > target ? [target / aspect, 1] : [1, aspect / target];
  return { repeat, offset: [(1 - repeat[0]) / 2, (1 - repeat[1]) / 2] };
}

/** ab diesem Seitenverhältnis füllt das Canvas die Wand allein (Querformat) */
export const WIDE_ASPECT = 1.6;

/**
 * Aufteilung auf der Wand: Hochkant-Canvas (der Normalfall, 9:16) in voller Höhe mittig, dahinter abgedunkelt als
 * Füllung; breite Canvas füllen die Wand allein.
 */
export function canvasLayout(aspect: number): {
  main: Crop & { width: number; height: number };
  fill: Crop | null;
} {
  const wall = WALL_W / WALL_H;
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 9 / 16;
  if (a >= WIDE_ASPECT) return { main: { width: WALL_W, height: WALL_H, ...coverCrop(a, wall) }, fill: null };
  const height = WALL_H * 0.96;
  return {
    main: { width: height * a, height, repeat: [1, 1], offset: [0, 0] },
    fill: coverCrop(a, wall),
  };
}
