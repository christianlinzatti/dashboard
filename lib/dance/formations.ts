export type Formation = "linie" | "v" | "halbkreis" | "spotlight";
export type Vec2 = readonly [x: number, z: number];

/**
 * Bühnenplätze je Formation. Platz 0 ist vorne Mitte (Lead bzw. aktiver Sänger),
 * danach abwechselnd links/rechts nach außen.
 */
export function slots(formation: Formation, n: number): Vec2[] {
  const side = (i: number) => (i === 0 ? 0 : i % 2 === 1 ? -Math.ceil(i / 2) : Math.ceil(i / 2));
  return Array.from({ length: n }, (_, i): Vec2 => {
    const s = side(i);
    const r = Math.abs(s);
    switch (formation) {
      case "linie":
        return [s * 1.5, 0];
      case "v":
        return [s * 1.35, 0.5 - r * 0.85];
      case "halbkreis": {
        const angle = (s / Math.max(Math.ceil((n - 1) / 2), 1)) * (Math.PI / 3.2);
        return [Math.sin(angle) * 2.4, Math.cos(angle) * 2.4 - 2.0];
      }
      case "spotlight":
        return i === 0 ? [0, 0.8] : [s * 1.7, -1.3];
    }
  });
}

export function lerp(a: number, b: number, w: number) {
  return a + (b - a) * w;
}

export function lerp2(a: Vec2, b: Vec2, w: number): Vec2 {
  return [lerp(a[0], b[0], w), lerp(a[1], b[1], w)];
}

export function easeInOut(w: number) {
  const x = Math.min(Math.max(w, 0), 1);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
