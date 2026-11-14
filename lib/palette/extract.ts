import type { Palette } from "@/lib/song-context/schema";

type HSL = { h: number; s: number; l: number };

export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex({ h, s, l }: HSL): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (
    "#" +
    [f(0), f(8), f(4)]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function hueDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Farbpalette aus RGBA-Pixeln (z. B. 24×24 verkleinertes Cover):
 * dominant = häufigste farbige Gruppe, accent = kräftigste gut sichtbare Farbe,
 * dark/light = Varianten für Hintergrund und Text.
 */
export function paletteFromPixels(data: ArrayLike<number>): Palette {
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3]! < 128) continue;
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }
  const colors = [...buckets.values()].map((e) => ({ n: e.n, hsl: rgbToHsl(e.r / e.n, e.g / e.n, e.b / e.n) }));
  if (!colors.length) return { dominant: "#7b2cff", accent: "#ff4fd8", dark: "#0b0712", light: "#f3e8ff" };

  // Dominant: Häufigkeit, farbige Töne leicht bevorzugt
  const dominant = colors.reduce((best, c) =>
    c.n * (0.4 + c.hsl.s) * (c.hsl.l > 0.08 && c.hsl.l < 0.92 ? 1 : 0.3) >
    best.n * (0.4 + best.hsl.s) * (best.hsl.l > 0.08 && best.hsl.l < 0.92 ? 1 : 0.3)
      ? c
      : best,
  ).hsl;

  // Akzent: kräftig und hell genug für Text auf dunklem Grund, möglichst anderer Farbton
  const score = (c: { n: number; hsl: HSL }) =>
    c.hsl.s * 2 + Math.min(c.n, 20) / 20 + (hueDistance(c.hsl.h, dominant.h) > 30 ? 0.5 : 0) - Math.abs(c.hsl.l - 0.55);
  const accentBase = colors.reduce((best, c) => (score(c) > score(best) ? c : best)).hsl;
  const accent = { h: accentBase.h, s: Math.max(accentBase.s, 0.65), l: Math.min(Math.max(accentBase.l, 0.6), 0.72) };

  return {
    dominant: hslToHex({ ...dominant, l: Math.min(Math.max(dominant.l, 0.35), 0.6) }),
    accent: hslToHex(accent),
    dark: hslToHex({ h: dominant.h, s: Math.min(dominant.s, 0.6), l: 0.07 }),
    light: hslToHex({ h: dominant.h, s: Math.min(dominant.s, 0.5), l: 0.94 }),
  };
}

/** Lädt das Cover im Browser und berechnet die Palette (Cover-Server muss CORS erlauben). */
export async function extractPalette(url: string): Promise<Palette | null> {
  if (typeof document === "undefined" || !url) return null;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
    const size = 24;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    return paletteFromPixels(ctx.getImageData(0, 0, size, size).data);
  } catch {
    return null;
  }
}
