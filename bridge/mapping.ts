import { hexToRgb, type Rgb } from "./govee.ts";

/** Rolle einer Lampe im Raum (in bridge/config.json festgelegt). */
export type Role = "puls" | "akzent" | "grund";

/** Lichtsignal vom Dashboard (LightDirector), siehe lib/stage/lights.ts → signal. */
export type LightSignal = { base: string; accent: string; brightness: number; pulse: number };

export type DeviceState = { on: boolean; color: Rgb; brightness: number };

/** Auf Raster runden: weniger Befehle, Lampen flackern nicht bei Kleinständerungen. */
const q = (v: number, step: number) => Math.round(v / step) * step;
const quantColor = (c: Rgb): Rgb => ({ r: q(c.r, 8), g: q(c.g, 8), b: q(c.b, 8) });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Wie eine Lampe einer Rolle auf das Lichtsignal reagiert:
 * - puls:   Akzentfarbe, Helligkeit springt mit dem Beat (z. B. LED-Strip hinter dem Display)
 * - akzent: Akzentfarbe, folgt der Gesamthelligkeit, leichter Puls (z. B. Wand-/Panel-Leuchte)
 * - grund:  ruhige Grundfarbe des Covers, gedimmt (z. B. Tischlampe)
 */
export function deviceStateFor(signal: LightSignal, role: Role, lampsOn: boolean): DeviceState {
  if (!lampsOn) return { on: false, color: { r: 0, g: 0, b: 0 }, brightness: 1 };
  const level = clamp(signal.brightness, 0, 1);
  switch (role) {
    case "puls":
      return {
        on: true,
        color: quantColor(hexToRgb(signal.accent)),
        brightness: clamp(q(100 * level * (0.3 + 0.7 * signal.pulse), 5), 5, 100),
      };
    case "akzent":
      return {
        on: true,
        color: quantColor(hexToRgb(signal.accent)),
        brightness: clamp(q(100 * level * (0.75 + 0.25 * signal.pulse), 5), 10, 100),
      };
    case "grund":
      return { on: true, color: quantColor(hexToRgb(signal.base)), brightness: clamp(q(45 * level, 5), 10, 60) };
  }
}

/** Befehle, die nötig sind, um von `prev` zu `next` zu kommen (nur Änderungen). */
export function diffCommands(prev: DeviceState | undefined, next: DeviceState): Array<"turn" | "color" | "brightness"> {
  const out: Array<"turn" | "color" | "brightness"> = [];
  if (!prev || prev.on !== next.on) out.push("turn");
  if (!next.on) return out;
  if (!prev || prev.color.r !== next.color.r || prev.color.g !== next.color.g || prev.color.b !== next.color.b) out.push("color");
  if (!prev || prev.brightness !== next.brightness || prev.on !== next.on) out.push("brightness");
  return out;
}
