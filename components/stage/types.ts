import type { Vec2 } from "@/lib/dance/formations";

/** Pro Frame berechnete Bühnenwerte, geteilt zwischen Director und Avataren (ohne React-State). */
export type Frame = {
  t: number;
  playing: boolean;
  positions: Record<string, Vec2>;
  focus?: string;
  anchorMs: number | null;
  dropMs: number | null;
  /** Licht-/LED-Puls 0..1 (fällt nach jedem Schlag ab) */
  pulse: number;
  vocal: number;
  energy: number;
  micActive: boolean;
};

export const initialFrame: Frame = {
  t: 0,
  playing: false,
  positions: {},
  anchorMs: null,
  dropMs: null,
  pulse: 0,
  vocal: 0,
  energy: 0,
  micActive: false,
};

export const TARGET_HEIGHT = 1.8;
