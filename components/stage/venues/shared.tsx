"use client";

import { useLayoutEffect, useRef } from "react";
import {
  CanvasTexture,
  type Color,
  Euler,
  type InstancedMesh,
  Matrix4,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
} from "three";
import { rng } from "@/lib/dance/rng";
import { songContext } from "@/lib/song-context/store";
import type { LightFrame } from "@/lib/stage/lights";

/** Was jede Kulisse bekommt: Akzentfarbe des Themas und das aktuelle Lichtbild */
export type VenueProps = { accent: string; lightsRef: React.RefObject<LightFrame | null> };

export const songSeconds = () => songContext.getState().positionMs / 1000;

export const plainVertex = /* glsl */ `
  varying vec2 vUv; varying vec3 vPos; varying vec3 vWorld;
  void main() {
    vUv = uv; vPos = position; vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Rauer Beton/Stein als Canvas-Textur (kachelbar) */
export function concreteTexture(seed: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const r = rng(seed);
  g.fillStyle = "#3c3b3a";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 40 + r.next() * 40;
    g.fillStyle = `rgba(${v},${v},${v - 3},${0.12 + r.next() * 0.2})`;
    g.fillRect(r.next() * 256, r.next() * 256, 1 + r.next() * 3, 1 + r.next() * 3);
  }
  // Schalungsfugen
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (let i = 0; i < 4; i++) g.fillRect(0, i * 64, 256, 2);
  g.fillRect(127, 0, 2, 256);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

// ———————————————————————————————————————— Instancing ————————————————————————————————————————

type Vec3 = readonly [number, number, number];
/** Eine Transformationsstufe: Position, Drehung (Euler XYZ), Größe */
export type Xf = { p?: Vec3; r?: Vec3; s?: Vec3 };

const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _m = new Matrix4();

/**
 * Matrix einer verschachtelten Transformation, äußere Stufe zuerst – wie `<group>` → `<group>` → `<mesh>` in JSX.
 * So lassen sich wiederholte Teile in ein einziges `instancedMesh` legen (ein Zeichenaufruf statt vieler).
 */
export function mat(...chain: Xf[]): Matrix4 {
  const out = new Matrix4();
  for (const { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } of chain) {
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(s[0], s[1], s[2]));
    out.multiply(_m);
  }
  return out;
}

/**
 * Viele gleiche Teile mit einem Zeichenaufruf: Geometrie und Material als Kinder, je Teil eine Matrix (siehe `mat`)
 * und optional eine Farbe. Für Bewegung pro Bild die Matrizen/Farben über `meshRef` nachführen.
 */
export function Instances({
  matrices,
  colors,
  meshRef,
  children,
}: {
  matrices: readonly Matrix4[];
  colors?: readonly Color[];
  meshRef?: React.RefObject<InstancedMesh | null>;
  children: React.ReactNode;
}) {
  const own = useRef<InstancedMesh>(null);
  const ref = meshRef ?? own;
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((x, i) => m.setMatrixAt(i, x));
    m.instanceMatrix.needsUpdate = true;
    colors?.forEach((c, i) => m.setColorAt(i, c));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // Hüllkugel über alle Teile, damit das Wegschneiden außerhalb des Bildes richtig greift
    m.computeBoundingSphere();
  }, [matrices, colors, ref]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, matrices.length]}>
      {children}
    </instancedMesh>
  );
}
