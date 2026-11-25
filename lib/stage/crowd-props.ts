import type { Vec2 } from "@/lib/dance/formations";

/**
 * Was über den Köpfen der Menge unterwegs ist – zustandslos aus der Songzeit (gleiche Zeit, gleiches Bild):
 * Wasserbälle, die von Händen hochgestoßen werden, und Crowdsurfer, die zur Bühne getragen werden.
 */

/** Höhe der Köpfe in der Menge (sie steht tiefer als die Bühne, siehe crowd/shared.ts) */
export const HEAD_Y = 0.62;
export const BALL_R = 0.32;
export const BALLS = 4;
export const SURFERS = 2;
/** so lange dauert eine Fahrt über die Menge bis zur Bühnenkante */
export const SURF_MS = 11_000;

const BALL_X = [-4.2, -1.7, 1.7, 4.2];

/** Ball i: treibt langsam über die Menge und springt alle 1,5–2 s von den Händen hoch */
export function ballAt(i: number, t: number): [number, number, number] {
  const s = t / 1000;
  const x = BALL_X[i % BALL_X.length]! + 0.8 * Math.sin(s * 0.31 + i * 2.1);
  const z = 8.2 + (i % 2) * 1.2 + 1.5 * Math.sin(s * 0.23 + i * 1.3);
  const period = 1.6 + i * 0.13;
  const y = HEAD_Y + 0.55 + 1.25 * Math.abs(Math.sin((Math.PI * s) / period + i));
  return [x, y, z];
}

export type Surfer = { pos: [number, number, number]; heading: number; visible: number };

/** Crowdsurfer i: von hinten zur Bühne getragen (wippt dabei), am Ende hilft die Security herunter */
export function surferAt(i: number, t: number): Surfer {
  const u = (((t / SURF_MS + i * 0.5) % 1) + 1) % 1;
  const side = i % 2 === 0 ? -1 : 1;
  const start: Vec2 = [side * 2.6, 12.4];
  const end: Vec2 = [side * 1.6, 5.6];
  const x = start[0] + (end[0] - start[0]) * u + 0.35 * Math.sin(u * 9 + i);
  const z = start[1] + (end[1] - start[1]) * u;
  const bob = 0.07 * Math.sin(t / 160 + i * 3);
  const visible = Math.min(1, u / 0.08, (1 - u) / 0.08);
  return { pos: [x, HEAD_Y + 0.72 + bob, z], heading: Math.atan2(end[0] - start[0], end[1] - start[1]), visible };
}
