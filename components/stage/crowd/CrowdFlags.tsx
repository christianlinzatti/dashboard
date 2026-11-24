"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, DoubleSide, type ShaderMaterial } from "three";
import { Instances, mat } from "../instances";
import type { LightFrame } from "@/lib/stage/lights";
import type { Frame } from "../types";

/** Plätze der Fahnen im Publikum (Mitte/hinten, nicht direkt vor der Kamera) */
const FLAG_SPOTS: Array<[number, number]> = [
  [-4.6, 8.2],
  [3.4, 9.6],
  [-1.6, 11.2],
  [5.6, 7.4],
  [1.2, 7.8],
];

const flagShader = {
  vertexShader: /* glsl */ `
    uniform float uTime, uPhase;
    varying vec2 vUv; varying float vShade;
    void main() {
      vUv = uv;
      // Stoff weht: Welle läuft vom Mast nach außen, außen stärker
      float w = uv.x;
      float wave = sin(uTime * 3.2 + uPhase - w * 5.0) * 0.12 * w + sin(uTime * 5.1 + uPhase * 2.0 - w * 9.0) * 0.03 * w;
      vec3 p = position + vec3(0.0, sin(uTime * 2.0 + uPhase - w * 3.0) * 0.04 * w, wave);
      vShade = 0.7 + 0.3 * cos(uTime * 3.2 + uPhase - w * 5.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uA, uB; uniform float uLight;
    varying vec2 vUv; varying float vShade;
    void main() {
      // zwei Streifen in den Farben des Songs
      vec3 c = vUv.y > 0.5 ? uA : uB;
      gl_FragColor = vec4(c * vShade * uLight, 1.0);
    }
  `,
};

/** Festival: ein paar Fahnen ragen aus der Menge und wehen. */
const FLAG_POLES = FLAG_SPOTS.map(([x, z]) => mat({ p: [x, 1.1, z] }));

export function CrowdFlags({
  colors,
  frameRef,
  lightsRef,
}: {
  colors: [string, string];
  frameRef: React.RefObject<Frame>;
  lightsRef: React.RefObject<LightFrame | null>;
}) {
  const mats = useRef<Array<ShaderMaterial | null>>([]);
  const [a, b] = colors;
  const uniforms = useMemo(
    () =>
      FLAG_SPOTS.map((_, i) => ({
        uTime: { value: 0 },
        uPhase: { value: i * 1.7 },
        uLight: { value: 1 },
        uA: { value: new Color(i % 2 ? b : a) },
        uB: { value: new Color(i % 3 === 0 ? "#f4f4f4" : i % 2 ? a : b) },
      })),
    [a, b],
  );
  useFrame(() => {
    const t = frameRef.current.t / 1000;
    const light = 0.35 + 0.4 * (1 - (lightsRef.current?.blackout ?? 0));
    mats.current.forEach((m) => {
      if (!m) return;
      m.uniforms.uTime!.value = t;
      m.uniforms.uLight!.value = light;
    });
  });
  return (
    <group>
      {/* alle Fahnenmasten: ein Zeichenaufruf */}
      <Instances matrices={FLAG_POLES}>
        <cylinderGeometry args={[0.015, 0.015, 2.6, 6]} />
        <meshStandardMaterial color="#888" metalness={0.6} roughness={0.4} />
      </Instances>
      {FLAG_SPOTS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation-y={(i % 2 ? 1 : -1) * 0.5}>
          <mesh position={[0.45, 2.1, 0]}>
            <planeGeometry args={[0.9, 0.56, 16, 4]} />
            <shaderMaterial
              ref={(m) => void (mats.current[i] = m)}
              args={[{ ...flagShader, uniforms: uniforms[i] }]}
              side={DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
