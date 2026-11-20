// Bausteine für Avatare aus Formen: abgerundete Körper (Superellipsoide), Glieder zwischen zwei Gelenken,
// Bögen (Mund) und Kegel. Jede Ecke trägt bis zu vier Knochen mit Gewicht – so biegen sich Ellbogen, Knie und
// Rumpf weich mit. Alles in der Grundhaltung (Weltkoordinaten der Bind-Pose: y oben, Blick nach +z).

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => mul(a, 1 / (len(a) || 1));
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
export const vec = { sub, add, mul, dot, cross, len, norm, lerp };

const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
export { smooth as smoothstep };

/** Vorzeichen-erhaltende Potenz (Superellipsoid) */
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;

/** Drehung um x, y, z (Radiant) */
function rotate(p, [rx, ry, rz] = [0, 0, 0]) {
  let [x, y, z] = p;
  if (rx) [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  if (ry) [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  if (rz) [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return [x, y, z];
}

/**
 * Sammelt Dreiecke je Material. `skin` ist entweder ein Knochenname oder eine Funktion (Ecke → [[Knochen, Gewicht], …]).
 */
export class Builder {
  constructor() {
    /** @type {Map<string, {positions:number[], skins:Array<Array<[string,number]>>, indices:number[]}>} */
    this.parts = new Map();
  }

  group(material) {
    let g = this.parts.get(material);
    if (!g) {
      g = { positions: [], skins: [], indices: [] };
      this.parts.set(material, g);
    }
    return g;
  }

  /** Gitter (rows × cols Ecken) als Fläche; `wrap`: Spalten schließen sich zum Ring */
  grid(material, rows, cols, vertexAt, skin, wrap = true) {
    const g = this.group(material);
    const base = g.positions.length / 3;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const p = vertexAt(r, c);
        g.positions.push(p[0], p[1], p[2]);
        g.skins.push(typeof skin === "function" ? skin(p) : [[skin, 1]]);
      }
    const cc = wrap ? cols : cols - 1;
    for (let r = 0; r < rows - 1; r++)
      for (let c = 0; c < cc; c++) {
        const a = base + r * cols + c;
        const b = base + r * cols + ((c + 1) % cols);
        const d = base + (r + 1) * cols + c;
        const e = base + (r + 1) * cols + ((c + 1) % cols);
        g.indices.push(a, d, b, b, d, e);
      }
  }

  /**
   * Abgerundeter Körper: Kugel (exp 1), Würfel mit runden Kanten (exp ~0.2–0.3), Kissen (exp verschieden je Achse).
   * `exp` = [Breite/Tiefe, Höhe]; `rot` dreht um die Mitte.
   */
  blob(material, center, radii, skin, { exp = 1, seg = 20, rot } = {}) {
    const [e1, e2] = Array.isArray(exp) ? exp : [exp, exp];
    const rows = Math.max(6, Math.round(seg * 0.6));
    this.grid(
      material,
      rows + 1,
      seg,
      (r, c) => {
        const v = -Math.PI / 2 + (Math.PI * r) / rows;
        const u = (2 * Math.PI * c) / seg;
        const cv = spow(Math.cos(v), e2);
        const local = [radii[0] * cv * spow(Math.sin(u), e1), radii[1] * spow(Math.sin(v), e2), radii[2] * cv * spow(Math.cos(u), e1)];
        return add(center, rotate(local, rot));
      },
      skin,
    );
  }

  /**
   * Röhre entlang eines Pfads (Punkte) mit Radius je Punkt – Glieder, Bögen, Antennen. Enden werden mit Kappen
   * geschlossen. `radius` als Zahl, Funktion (t → r) oder [rx, rz] (elliptisch, rz in Richtung `up`).
   */
  tube(material, points, radius, skin, { seg = 14, caps = true, up = [0, 0, 1] } = {}) {
    const n = points.length;
    const frames = points.map((p, i) => {
      const t = norm(sub(points[Math.min(i + 1, n - 1)], points[Math.max(i - 1, 0)]));
      let s = cross(t, up);
      if (len(s) < 1e-4) s = cross(t, [1, 0, 0]);
      s = norm(s);
      return { t, s, b: norm(cross(s, t)) };
    });
    const rAt = (i) => {
      const t = i / (n - 1);
      const r = typeof radius === "function" ? radius(t) : radius;
      return Array.isArray(r) ? r : [r, r];
    };
    this.grid(
      material,
      n,
      seg,
      (r, c) => {
        const a = (2 * Math.PI * c) / seg;
        const [rx, rz] = rAt(r);
        const f = frames[r];
        return add(points[r], add(mul(f.s, Math.cos(a) * rx), mul(f.b, Math.sin(a) * rz)));
      },
      skin,
    );
    if (caps) {
      const [r0] = rAt(0);
      const [r1] = rAt(n - 1);
      this.blob(material, points[0], [r0, r0, r0], skin, { seg });
      this.blob(material, points[n - 1], [r1, r1, r1], skin, { seg });
    }
  }

  /** Glied von Gelenk a nach b (gerade Röhre) – die Gewichte gehen am Ende weich zum nächsten Knochen über */
  limb(material, a, b, r0, r1, boneA, boneB, { blend = 0.3, seg = 14, steps = 8, caps = true } = {}) {
    const pts = Array.from({ length: steps + 1 }, (_, i) => lerp(a, b, i / steps));
    const ab = sub(b, a);
    const l2 = dot(ab, ab);
    const skin = (p) => {
      const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
      const w = boneB ? 0.5 * smooth(1 - blend, 1, t) : 0;
      return w > 0.001 ? [[boneA, 1 - w], [boneB, w]] : [[boneA, 1]];
    };
    this.tube(material, pts, (t) => r0 + (r1 - r0) * t, skin, { seg, caps });
  }

  /** Kegel (Spitze, Hut, Stachel): von der Grundfläche um `base` zur Spitze `tip` */
  cone(material, base, tip, radius, skin, seg = 12) {
    this.tube(material, [base, lerp(base, tip, 0.5), tip], (t) => Math.max(radius * (1 - t), 0.0005), skin, { seg, caps: false });
    this.blob(material, base, [radius, 0.002, radius], skin, { seg });
  }

  /** Bogen in der x/y-Ebene vor dem Gesicht (Mund, Augenbraue) */
  arc(material, center, width, depth, thickness, skin, { z = 0, upward = false } = {}) {
    const pts = Array.from({ length: 11 }, (_, i) => {
      const u = -1 + (2 * i) / 10;
      const y = (upward ? 1 : -1) * depth * (1 - u * u);
      return add(center, [u * width, y, z - Math.abs(u) * 0.01]);
    });
    this.tube(material, pts, thickness, skin, { seg: 8 });
  }
}

/** Gewichte nach der Höhe: Liste [[y, Knochen], …] (aufsteigend); dazwischen linear überblendet */
export function byHeight(stops) {
  return (p) => {
    const y = p[1];
    if (y <= stops[0][0]) return [[stops[0][1], 1]];
    for (let i = 0; i < stops.length - 1; i++) {
      const [y0, b0] = stops[i];
      const [y1, b1] = stops[i + 1];
      if (y <= y1) {
        const w = smooth(y0, y1, y);
        return w < 0.001 ? [[b0, 1]] : w > 0.999 ? [[b1, 1]] : [[b0, 1 - w], [b1, w]];
      }
    }
    return [[stops.at(-1)[1], 1]];
  };
}
