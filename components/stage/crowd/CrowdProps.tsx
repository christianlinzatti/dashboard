"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, Matrix4, Object3D, RepeatWrapping, SRGBColorSpace, type InstancedMesh } from "three";
import type { Choreography } from "@/lib/dance/plan";
import { crowdAt } from "@/lib/stage/crowd";
import { BALL_R, BALLS, SURFERS, ballAt, surferAt } from "@/lib/stage/crowd-props";
import type { Frame } from "../types";
import { personGeometry } from "./shared";

/** Streifen eines Wasserballs (Kugel-UV: senkrechte Keile) */
function ballTexture() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 8;
  const g = c.getContext("2d");
  const colors = ["#f5f5f5", "#e8343a", "#ffd23f", "#2f7de1", "#f5f5f5", "#3cc46b"];
  if (g) colors.forEach((col, i) => ((g.fillStyle = col), g.fillRect((i * 128) / colors.length, 0, 128 / colors.length + 1, 8)));
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  return t;
}

const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/**
 * Wasserbälle (Refrain fröhlicher Songs) und Crowdsurfer (Rock-Refrain) über der Menge. Je ein Zeichenaufruf,
 * Bahnen aus lib/stage/crowd-props.ts; ein- und ausgeblendet über die Publikums-Regie.
 */
export function CrowdProps({
  choreo,
  frameRef,
  balls,
  color,
}: {
  choreo: Choreography;
  frameRef: React.RefObject<Frame>;
  /** Bühne mit Wasserbällen */
  balls: boolean;
  /** Lichtfarbe der Bühne: die Surfer tragen Shirts, die sie auffangen (sonst nur ein dunkler Klotz über der Menge) */
  color: string;
}) {
  const ballMesh = useRef<InstancedMesh>(null);
  const surfMesh = useRef<InstancedMesh>(null);
  const tex = useMemo(() => (balls ? ballTexture() : null), [balls]);
  const surfer = useMemo(() => personGeometry(), []);
  useEffect(() => () => (tex?.dispose(), surfer.dispose()), [tex, surfer]);
  const o = useMemo(() => new Object3D(), []);
  const shirt = useMemo(() => new Color("#b9b2c8").lerp(new Color(color), 0.45), [color]);
  const shown = useRef({ balls: 0, surf: 0, t: null as number | null });

  useFrame(({ gl }) => {
    const f = frameRef.current;
    const c = f.playing ? crowdAt(choreo, f.t) : null;
    // weich ein- und ausblenden (Bälle werden eingesammelt, Surfer abgesetzt); beim ersten Bild und nach einem Sprung
    // in der Songzeit sofort auf den Zielwert (angehaltene Szene: nur wenige Bilder)
    const jump = shown.current.t === null || Math.abs(f.t - shown.current.t) > 1000;
    const k = jump ? 1 : 0.08;
    shown.current.t = f.t;
    shown.current.balls += ((balls ? (c?.balls ?? 0) : 0) - shown.current.balls) * k;
    shown.current.surf += ((c?.surf ?? 0) - shown.current.surf) * k;
    const bm = ballMesh.current;
    if (bm) {
      const k = shown.current.balls;
      for (let i = 0; i < BALLS; i++) {
        if (k < 0.02) {
          bm.setMatrixAt(i, HIDDEN);
          continue;
        }
        const [x, y, z] = ballAt(i, f.t);
        o.position.set(x, y, z);
        o.rotation.set(f.t / 900 + i, f.t / 1300, 0);
        o.scale.setScalar(BALL_R * k);
        o.updateMatrix();
        bm.setMatrixAt(i, o.matrix);
      }
      bm.instanceMatrix.needsUpdate = true;
    }
    const sm = surfMesh.current;
    if (sm) {
      for (let i = 0; i < SURFERS; i++) {
        const s = surferAt(i, f.t);
        const k = shown.current.surf * s.visible;
        if (k < 0.02) {
          sm.setMatrixAt(i, HIDDEN);
          continue;
        }
        // auf dem Rücken liegend, Kopf voran zur Bühne; beim Ein- und Ausblenden taucht er aus der Menge auf bzw. ab
        o.position.set(s.pos[0], s.pos[1] - (1 - k) * 0.8, s.pos[2]);
        o.rotation.set(-Math.PI / 2 + 0.15 * Math.sin(f.t / 300 + i), s.heading + Math.PI, 0.2 * Math.sin(f.t / 450 + i), "YXZ");
        o.scale.setScalar(0.95);
        o.updateMatrix();
        sm.setMatrixAt(i, o.matrix);
      }
      sm.instanceMatrix.needsUpdate = true;
    }
    // für Tests und Debug
    const label = `${shown.current.balls > 0.5 ? "baelle" : ""}${shown.current.surf > 0.5 ? "surfer" : ""}`;
    if (gl.domElement.dataset.crowdProps !== label) gl.domElement.dataset.crowdProps = label;
  });

  return (
    <group>
      {balls && tex && (
        <instancedMesh ref={ballMesh} args={[undefined, undefined, BALLS]} frustumCulled={false}>
          <sphereGeometry args={[1, 20, 14]} />
          <meshStandardMaterial map={tex} roughness={0.35} metalness={0} />
        </instancedMesh>
      )}
      <instancedMesh ref={surfMesh} args={[surfer, undefined, SURFERS]} frustumCulled={false}>
        <meshStandardMaterial color={shirt} emissive={shirt} emissiveIntensity={0.18} roughness={0.7} />
      </instancedMesh>
    </group>
  );
}
