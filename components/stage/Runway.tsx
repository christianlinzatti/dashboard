"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { AdditiveBlending, DoubleSide, type MeshBasicMaterial } from "three";
import type { LightFrame } from "@/lib/stage/lights";
import { B_STAGE_R, B_STAGE_Z, RUNWAY_FROM_Z, RUNWAY_HALF_W } from "@/lib/stage/staging";
import type { Frame } from "./types";

const LEN = B_STAGE_Z - RUNWAY_FROM_Z;
const MID = (B_STAGE_Z + RUNWAY_FROM_Z) / 2;

/**
 * Laufsteg von der Bühnenkante mitten ins Publikum mit runder B-Bühne am Ende (gleiche Höhe wie das Podest).
 * LED-Kanten leuchten in der Akzentfarbe und pulsieren im Takt; die Menge hält ihn frei (crowd/shared.ts).
 */
export function Runway({
  dark,
  accent,
  frameRef,
  lightsRef,
}: {
  dark: string;
  accent: string;
  frameRef: React.RefObject<Frame>;
  lightsRef: React.RefObject<LightFrame | null>;
}) {
  const edges = useRef<MeshBasicMaterial[]>([]);
  const ring = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const lf = lightsRef.current;
    const level =
      (0.35 + 0.65 * (lf?.signal.pulse ?? 0)) * (1 - 0.85 * (lf?.blackout ?? 0)) * (frameRef.current.playing ? 1 : 0.4);
    for (const m of edges.current) m.opacity = 0.35 + 0.65 * level;
    if (ring.current) ring.current.opacity = 0.3 + 0.7 * level;
  });
  return (
    <group>
      {/* Steg und B-Bühne */}
      <mesh position={[0, -0.13, MID]}>
        <boxGeometry args={[RUNWAY_HALF_W * 2, 0.26, LEN + 0.4]} />
        <meshStandardMaterial color={dark} roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position={[0, -0.13, B_STAGE_Z]}>
        <cylinderGeometry args={[B_STAGE_R, B_STAGE_R + 0.08, 0.26, 40]} />
        <meshStandardMaterial color={dark} roughness={0.35} metalness={0.5} />
      </mesh>
      {/* LED-Kanten links und rechts, Ring um die B-Bühne */}
      {[-1, 1].map((side, i) => (
        <mesh key={side} position={[side * (RUNWAY_HALF_W - 0.03), 0.004, MID - 0.1]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.05, LEN - 0.5]} />
          <meshBasicMaterial
            ref={(m) => {
              if (m) edges.current[i] = m;
            }}
            color={accent}
            transparent
            toneMapped={false}
          />
        </mesh>
      ))}
      <mesh position={[0, 0.004, B_STAGE_Z]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[B_STAGE_R - 0.08, B_STAGE_R - 0.03, 48]} />
        <meshBasicMaterial
          ref={ring}
          color={accent}
          transparent
          toneMapped={false}
          side={DoubleSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
