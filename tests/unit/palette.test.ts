import { describe, expect, it } from "vitest";
import { hslToHex, paletteFromPixels, rgbToHsl } from "@/lib/palette/extract";

function pixels(colors: Array<[number, number, number, number]>) {
  return colors.flatMap(([r, g, b, n]) => Array.from({ length: n }, () => [r, g, b, 255]).flat());
}

describe("Cover-Palette", () => {
  it("Umrechnung HSL ↔ Hex", () => {
    expect(hslToHex(rgbToHsl(255, 0, 0))).toBe("#ff0000");
    expect(hslToHex(rgbToHsl(18, 52, 86))).toBe("#123456");
  });

  it("dominant = häufigste Farbe, accent = kräftiger anderer Ton, dark/light passend", () => {
    const p = paletteFromPixels(
      pixels([
        [30, 60, 160, 300], // viel Blau
        [250, 200, 20, 40], // etwas Gelb
        [128, 128, 128, 50], // Grau
      ]),
    );
    const dom = rgbToHsl(...hex(p.dominant));
    const acc = rgbToHsl(...hex(p.accent));
    expect(dom.h).toBeGreaterThan(200);
    expect(dom.h).toBeLessThan(240);
    expect(acc.h).toBeGreaterThan(30);
    expect(acc.h).toBeLessThan(60);
    expect(rgbToHsl(...hex(p.dark)).l).toBeLessThan(0.1);
    expect(rgbToHsl(...hex(p.light)).l).toBeGreaterThan(0.9);
  });

  it("liefert Standardfarben bei leerem/transparentem Bild", () => {
    expect(paletteFromPixels([0, 0, 0, 0]).accent).toBe("#ff4fd8");
  });
});

function hex(h: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
