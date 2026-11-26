"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, type Group, type ShaderMaterial } from "three";
import type { Choreography } from "@/lib/dance/plan";
import { liftGlowAt, LIFT_DEPTH } from "@/lib/stage/staging";
import type { Frame } from "./types";
import { useShaderArgs } from "./shader-args";

/**
 * Hubpodest: runde Plattform unter den Füßen des Leads, die mit ihm aus dem Boden fährt, dazu eine Lichtsäule von
 * unten durch den Nebel (Gegenlicht beim Auftritt). Nur bei Auftakt und Zugabe (lib/stage/staging.ts).
 */
export function LiftShaft({
  choreo,
  frameRef,
  color,
}: {
  choreo: Choreography;
  frameRef: React.RefObject<Frame>;
  color: string;
}) {
  const group = useRef<Group>(null);
  const plate = useRef<Group>(null);
  const beam = useRef<ShaderMaterial>(null);
  const lift = choreo.staging?.lift;
  useFrame(() => {
    const f = frameRef.current;
    const lead = choreo.order[0];
    const p = lead ? f.positions[lead] : undefined;
    const glow = liftGlowAt(choreo, lift, f.t);
    if (group.current) group.current.visible = !!p && (glow > 0.01 || (f.lifts[lead!] ?? 0) < 0);
    if (!p || !group.current?.visible) return;
    group.current.position.set(p[0], 0, p[1]);
    if (plate.current) plate.current.position.y = Math.min(f.lifts[lead!] ?? 0, 0) - 0.03;
    if (beam.current) beam.current.uniforms.uLevel!.value = glow * (0.75 + 0.25 * Math.sin(f.t / 90));
  });
  const beamUniforms = useMemo(() => ({ uLevel: { value: 0 }, uColor: { value: new Color(color) } }), [color]);
  const beamArgs = useShaderArgs({
    uniforms: beamUniforms,
    vertexShader: /* glsl */ `
                varying float vY;
                void main() { vY = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
              `,
    fragmentShader: /* glsl */ `
                uniform float uLevel; uniform vec3 uColor; varying float vY;
                void main() { gl_FragColor = vec4(mix(vec3(1.0), uColor, 0.45) * uLevel * 0.55 * pow(1.0 - vY, 1.6), 1.0); }
              `,
  });
  if (!lift) return null;
  return (
    <group ref={group} visible={false}>
      <group ref={plate}>
        <mesh>
          <cylinderGeometry args={[0.55, 0.55, 0.06, 32]} />
          <meshStandardMaterial color="#1a1a22" metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position-y={-LIFT_DEPTH / 2}>
          <cylinderGeometry args={[0.08, 0.08, LIFT_DEPTH, 8]} />
          <meshStandardMaterial color="#2a2a33" metalness={0.8} roughness={0.3} />
        </mesh>
      </group>
      {/* Lichtsäule: oben weit, nach oben verblassend */}
      <mesh position-y={3}>
        <cylinderGeometry args={[0.95, 0.5, 6, 32, 1, true]} />
        <shaderMaterial
          ref={beam}
          transparent
          depthWrite={false}
          side={DoubleSide}
          blending={AdditiveBlending}
          toneMapped={false}
          args={beamArgs}
        />
      </mesh>
    </group>
  );
}
