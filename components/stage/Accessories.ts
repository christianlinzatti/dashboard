import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
  type SkinnedMesh,
} from "three";
import type { Look } from "@/lib/avatars/looks";

/**
 * Zubehör für die Avatare: Hüte, Kopfhörer, Sonnenbrille, Mikrofon. Die Teile werden in der Grundhaltung an der
 * gemessenen Kopfform ausgerichtet (Breite und Scheitel aus den Vertices über dem Hals) und dann an den Kopf- bzw.
 * Handknochen gehängt – so tanzen sie mit. Alle Maße in Metern der normierten Figur (1,8 m).
 */

type HeadShape = { top: number; center: Vector3; radius: number };

const V = new Vector3();

/** Kopfform in der Grundhaltung: Scheitel, Mitte und halbe Breite (95-%-Werte, damit Antennen/Haarknoten nicht zählen) */
function measureHead(model: Object3D): HeadShape | null {
  const neck = model.getObjectByName("Neck");
  const head = model.getObjectByName("Head");
  if (!neck || !head) return null;
  model.updateMatrixWorld(true);
  const neckY = neck.getWorldPosition(new Vector3()).y;
  const hx = head.getWorldPosition(new Vector3()).x;
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  model.traverse((o) => {
    const m = o as SkinnedMesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute("position");
    const step = Math.max(1, Math.floor(pos.count / 5000));
    for (let i = 0; i < pos.count; i += step) {
      m.getVertexPosition(i, V).applyMatrix4(m.matrixWorld);
      if (V.y > neckY + 0.03 && Math.abs(V.x - hx) < 0.45) {
        xs.push(V.x);
        ys.push(V.y);
        zs.push(V.z);
      }
    }
  });
  if (ys.length < 20) return null;
  const q = (a: number[], p: number) => a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]!;
  const radius = (q(xs, 0.95) - q(xs, 0.05)) / 2;
  return { top: q(ys, 0.93), center: new Vector3(q(xs, 0.5), 0, q(zs, 0.5)), radius: Math.max(radius, 0.08) };
}

type Built = { geometries: BufferGeometry[]; materials: Material[] };

function part(g: BufferGeometry, m: Material, built: Built, at: [number, number, number], rot?: [number, number, number]) {
  built.geometries.push(g);
  const mesh = new Mesh(g, m);
  mesh.position.set(...at);
  if (rot) mesh.rotation.set(...rot);
  return mesh;
}

function material(color: string, built: Built, opts: { metalness?: number; roughness?: number; emissive?: string } = {}) {
  const m = new MeshStandardMaterial({
    color,
    metalness: opts.metalness ?? 0.1,
    roughness: opts.roughness ?? 0.7,
    emissive: opts.emissive ?? "#000000",
  });
  built.materials.push(m);
  return m;
}

/** Hut, Kopfhörer, Brille nach dem Look; gibt Geometrien/Materialien zum Aufräumen zurück. */
export function dressUp(model: Object3D, look: Look, opts: { color: string; accent: string; comic: boolean }): Built {
  const built: Built = { geometries: [], materials: [] };
  const head = model.getObjectByName("Head");
  const shape = head ? measureHead(model) : null;
  if (!head || !shape) return built;
  const { top, center, radius: R } = shape;
  const cy = top - R * 0.95; // Kopfmitte (Kopf ≈ Kugel)
  const acc = new Group();
  const cloth = material(opts.color, built, { roughness: 0.85 });
  const band = material(opts.accent, built, { emissive: opts.accent, roughness: 0.5 });

  switch (look.hat) {
    case "basecap":
      // Kappe endet über den Augenbrauen (Kugelkappe bis 0,3 R über der Kopfmitte), Schirm nach vorn
      acc.add(part(new SphereGeometry(R * 1.06, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), cloth, built, [0, cy, 0]));
      acc.add(
        part(new CylinderGeometry(R * 0.7, R * 0.7, R * 0.06, 20), cloth, built, [0, cy + R * 0.32, R * 0.98], [0.15, 0, 0]),
      );
      break;
    case "muetze":
      acc.add(part(new SphereGeometry(R * 1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.44), cloth, built, [0, cy, 0]));
      acc.add(part(new TorusGeometry(R * 1.04, R * 0.13, 8, 28), cloth, built, [0, cy + R * 0.2, 0], [Math.PI / 2, 0, 0]));
      acc.add(part(new SphereGeometry(R * 0.3, 12, 8), band, built, [0, top + R * 0.28, 0]));
      break;
    case "cowboyhut":
      acc.add(part(new CylinderGeometry(R * 2.05, R * 2.05, R * 0.05, 28), cloth, built, [0, top - R * 0.3, 0]));
      acc.add(part(new CylinderGeometry(R * 0.78, R * 0.92, R * 0.8, 20), cloth, built, [0, top + R * 0.1, 0]));
      acc.add(part(new CylinderGeometry(R * 0.93, R * 0.93, R * 0.14, 20), band, built, [0, top - R * 0.22, 0]));
      break;
    case "zylinder":
      acc.add(part(new CylinderGeometry(R * 1.35, R * 1.35, R * 0.05, 24), cloth, built, [0, top - R * 0.25, 0]));
      acc.add(part(new CylinderGeometry(R * 0.82, R * 0.8, R * 1.4, 20), cloth, built, [0, top + R * 0.45, 0]));
      acc.add(part(new CylinderGeometry(R * 0.83, R * 0.83, R * 0.16, 20), band, built, [0, top - R * 0.12, 0]));
      break;
    case "fischerhut":
      acc.add(part(new CylinderGeometry(R * 0.86, R * 1.06, R * 0.62, 20), cloth, built, [0, top - R * 0.12, 0]));
      acc.add(part(new CylinderGeometry(R * 1.06, R * 1.45, R * 0.24, 22, 1, true), cloth, built, [0, top - R * 0.52, 0]));
      break;
  }
  if (look.headphones) {
    const shell = material("#1a1a20", built, { metalness: 0.5, roughness: 0.35 });
    acc.add(part(new TorusGeometry(R * 1.14, R * 0.07, 8, 24, Math.PI), shell, built, [0, cy, 0]));
    for (const s of [-1, 1]) {
      acc.add(
        part(new CylinderGeometry(R * 0.34, R * 0.34, R * 0.22, 18), shell, built, [s * R * 1.12, cy, 0], [0, 0, Math.PI / 2]),
      );
      acc.add(
        part(new CylinderGeometry(R * 0.2, R * 0.2, R * 0.23, 14), band, built, [s * R * 1.13, cy, 0], [0, 0, Math.PI / 2]),
      );
    }
  }
  if (look.glasses && opts.comic) {
    const eyes = ["FaceEyeLeft", "FaceEyeRight"].map((n) => model.getObjectByName(n)?.getWorldPosition(new Vector3()));
    if (eyes[0] && eyes[1]) {
      const lens = material("#0a0a10", built, { metalness: 0.6, roughness: 0.15 });
      const eyeY = (eyes[0].y + eyes[1].y) / 2;
      const front = Math.max(eyes[0].z, eyes[1].z) - center.z + R * 0.06;
      for (const e of eyes)
        acc.add(
          part(
            new CylinderGeometry(R * 0.3, R * 0.3, R * 0.05, 20),
            lens,
            built,
            [e!.x - center.x, eyeY, front],
            [Math.PI / 2, 0, 0],
          ),
        );
      const gap = Math.abs(eyes[0].x - eyes[1].x);
      acc.add(
        part(
          new CylinderGeometry(R * 0.04, R * 0.04, gap * 0.5, 6),
          lens,
          built,
          [(eyes[0].x + eyes[1].x) / 2 - center.x, eyeY + R * 0.06, front],
          [0, 0, Math.PI / 2],
        ),
      );
    }
  }
  if (!acc.children.length) return built;
  // in Weltkoordinaten der Grundhaltung platzieren, dann an den Kopf hängen (attach behält die Weltlage)
  acc.position.set(center.x, 0, center.z);
  head.attach(acc);
  return built;
}

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);

/** Handmikrofon in der rechten Hand: Griff quer durch die Faust, Korb nach oben/vorn. */
export function addMicrophone(model: Object3D, built: Built = { geometries: [], materials: [] }): Built {
  const hand = model.getObjectByName("RightHand");
  const fore = model.getObjectByName("RightForeArm");
  if (!hand || !fore) return built;
  model.updateMatrixWorld(true);
  const h = hand.getWorldPosition(new Vector3());
  const f = fore.getWorldPosition(new Vector3());
  const along = h.clone().sub(f).normalize();
  // Faust ein Stück hinter dem Handgelenk; Griff senkrecht zur Fingerrichtung, möglichst nach oben und leicht nach vorn
  const fist = h.clone().addScaledVector(along, 0.055);
  const axis = UP.clone().addScaledVector(FORWARD, 0.6);
  axis.addScaledVector(along, -axis.dot(along)).normalize();
  const mic = new Group();
  const body = material("#1c1c22", built, { metalness: 0.6, roughness: 0.35 });
  const grille = material("#b9bcc6", built, { metalness: 0.7, roughness: 0.35, emissive: "#22232a" });
  mic.add(part(new CylinderGeometry(0.02, 0.014, 0.2, 12), body, built, [0, 0.0, 0]));
  mic.add(part(new SphereGeometry(0.04, 14, 10), grille, built, [0, 0.125, 0]));
  mic.position.copy(fist);
  mic.quaternion.copy(new Quaternion().setFromUnitVectors(UP, axis));
  hand.attach(mic);
  return built;
}
