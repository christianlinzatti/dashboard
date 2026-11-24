"use client";

import { useLayoutEffect, useRef } from "react";
import { type Color, Euler, type InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";

/**
 * Instancing für wiederholte Teile der Bühne: viele gleiche Formen mit einem Zeichenaufruf. Jede eingesparte Form
 * spart doppelt, denn die Live-Bildschirme filmen die Bühne ein zweites Mal.
 */

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
