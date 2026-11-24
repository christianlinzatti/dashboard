"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, type Mesh, type Points } from "three";
import { rng } from "@/lib/dance/rng";
import { type ActiveCue } from "@/lib/stage/effects";
import type { Frame } from "../types";

export function MirrorBall({
  activeRef,
  frameRef,
  color,
}: {
  activeRef: React.RefObject<ActiveCue[]>;
  frameRef: React.RefObject<Frame>;
  color: string;
}) {
  const ball = useRef<Mesh>(null);
  const dots = useRef<Points>(null);
  const geometry = useMemo(() => {
    const r = rng("glitzer");
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Punkte auf einer großen Kugel um die Spiegelkugel (Lichtflecken im Raum)
      const z = r.next() * 1.6 - 0.9;
      const th = r.next() * Math.PI * 2;
      const rr = Math.sqrt(1 - z * z);
      const R = 5 + r.next() * 3;
      pos.set([rr * Math.cos(th) * R, z * R * 0.6, rr * Math.sin(th) * R], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame(() => {
    const cue = activeRef.current.find((c) => c.kind === "glitzer");
    const t = frameRef.current.t / 1000;
    if (ball.current) ball.current.rotation.y = t * 0.4;
    if (dots.current) {
      dots.current.visible = !!cue;
      dots.current.rotation.y = t * 0.4;
      (dots.current.material as { opacity: number }).opacity = (cue?.intensity ?? 0) * (0.45 + 0.25 * frameRef.current.pulse);
    }
  });
  return (
    <group position={[0, 3.7, 0.4]}>
      <mesh ref={ball}>
        <icosahedronGeometry args={[0.32, 2]} />
        <meshStandardMaterial
          color="#d8d8e0"
          metalness={1}
          roughness={0.15}
          flatShading
          emissive={color}
          emissiveIntensity={0.15}
        />
      </mesh>
      <points ref={dots} geometry={geometry} visible={false}>
        <pointsMaterial
          color={color}
          size={0.06}
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

/**
 * Spezialeffekte der Bühne. Die Einsätze plant die Effekt-Regie (lib/stage/effects.ts);
 * hier werden nur die Effekte des aktuellen Themas aufgebaut und pro Frame die aktiven gezeigt.
 */
