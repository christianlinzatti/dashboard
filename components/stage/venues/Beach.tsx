"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, type InstancedMesh, type Matrix4, type ShaderMaterial } from "three";
import { rng } from "@/lib/dance/rng";
import { Instances, mat, plainVertex, songSeconds, type VenueProps, type Xf } from "./shared";

/** Meer bis zum Horizont mit Sonnenglitzern, tiefstehende Sonne, Palmen und Lichterketten. */
export function Beach({ accent, lightsRef }: VenueProps) {
  const sea = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uSun: { value: new Color("#ffb347") }, uDeep: { value: new Color("#1b1440") } }),
    [],
  );
  useFrame(() => {
    if (sea.current) sea.current.uniforms.uTime!.value = songSeconds();
  });
  return (
    <group>
      {/* Sonne knapp über dem Horizont */}
      <mesh position={[0, 3.2, -52]}>
        <circleGeometry args={[5.5, 48]} />
        <meshBasicMaterial color="#ffcf6b" toneMapped={false} fog={false} />
      </mesh>
      <mesh position={[0, 3.2, -52.1]}>
        <circleGeometry args={[12, 48]} />
        <meshBasicMaterial color="#ff8a4a" transparent opacity={0.25} toneMapped={false} fog={false} depthWrite={false} />
      </mesh>
      {/* Meer: Wellen und ein Glitzerstreifen unter der Sonne */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.2, -32]}>
        <planeGeometry args={[140, 52]} />
        <shaderMaterial
          ref={sea}
          fog={false}
          args={[
            {
              uniforms,
              vertexShader: plainVertex,
              fragmentShader: /* glsl */ `
                uniform float uTime; uniform vec3 uSun, uDeep; varying vec3 vWorld;
                void main() {
                  float far = clamp((-vWorld.z - 6.0) / 46.0, 0.0, 1.0);
                  float w = sin(vWorld.z * 2.3 + uTime * 1.4) * sin(vWorld.x * 0.7 + uTime * 0.6 + vWorld.z * 0.4);
                  // Glitzerstreifen in Richtung Sonne, zum Horizont hin schmaler
                  float lane = exp(-pow(vWorld.x / (2.0 + 9.0 * (1.0 - far)), 2.0));
                  float glint = lane * smoothstep(0.55, 0.95, w * 0.5 + 0.5);
                  vec3 c = mix(uDeep * 1.4, uSun * 0.55, far * far) + uSun * glint * 0.9;
                  gl_FragColor = vec4(c, 1.0);
                }
              `,
            },
          ]}
        />
      </mesh>
      {/* Wellen am Ufer (hellere Linie) */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.19, -6.4]}>
        <planeGeometry args={[60, 0.25]} />
        <meshBasicMaterial color="#fde7c8" transparent opacity={0.35} />
      </mesh>
      <Palms />
      <StringLights accent={accent} lightsRef={lightsRef} />
    </group>
  );
}

const PALMS = [
  { x: -6.2, z: -1.5, lean: 0.25, height: 6.2 },
  { x: -7.6, z: 1.6, lean: -0.15, height: 5.4 },
  { x: 6.4, z: -2.2, lean: -0.3, height: 6.8 },
  { x: 7.4, z: 1.4, lean: 0.2, height: 5.0 },
  { x: -9.5, z: -5, lean: 0.1, height: 7.2 },
  { x: 10, z: -4.6, lean: -0.2, height: 6.4 },
];
const SEGS = 7;

/** Alle Palmen: Stämme aus leicht gebogenen Abschnitten, oben ein Kranz hängender Wedel – je ein Zeichenaufruf. */
function Palms() {
  const { trunks, fronds } = useMemo(() => {
    const trunks: Matrix4[] = [];
    const fronds: Matrix4[] = [];
    PALMS.forEach(({ x, z, lean, height }, seed) => {
      const base: Xf = { p: [x, -0.25, z] };
      let topX = 0;
      for (let i = 0; i < SEGS; i++) {
        const u = (i + 0.5) / SEGS;
        const tx = Math.sin(u * 1.4) * lean * height * 0.35;
        const r = 0.2 - u * 0.08;
        trunks.push(mat(base, { p: [tx, u * height, 0], r: [0, 0, -lean * 0.6], s: [r, height / SEGS + 0.04, r] }));
        topX = tx;
      }
      const rand = rng(`palme-${seed}`);
      for (let i = 0; i < 8; i++) {
        const yaw = (i / 8) * Math.PI * 2 + rand.next() * 0.4;
        const droop = 0.5 + rand.next() * 0.5;
        fronds.push(
          mat(base, { p: [topX, height, 0] }, { r: [0, yaw, 0] }, { p: [0.9, -0.25 * droop, 0], r: [0, 0, -0.35 * droop] }),
        );
      }
    });
    return { trunks, fronds };
  }, []);
  return (
    <group>
      <Instances matrices={trunks}>
        <cylinderGeometry args={[0.9, 1, 1, 8]} />
        <meshStandardMaterial color="#2a1b12" roughness={0.9} />
      </Instances>
      <Instances matrices={fronds}>
        <boxGeometry args={[1.9, 0.03, 0.42]} />
        <meshStandardMaterial color="#0f2416" roughness={0.8} />
      </Instances>
    </group>
  );
}

const BULBS = 26;
const bulbMatrices = Array.from({ length: BULBS }, (_, i) => {
  const u = i / (BULBS - 1);
  return mat({ p: [-5.6 + u * 11.2, 3.6 - Math.sin(u * Math.PI) * 0.9, 2.6 - Math.sin(u * Math.PI) * 0.6] });
});

/** Lichterkette in einem Bogen über die Bühnenfront, Birnchen glimmen im Takt */
function StringLights({ accent, lightsRef }: VenueProps) {
  const bulbs = useRef<InstancedMesh>(null);
  const warm = useMemo(() => new Color("#ffd28a"), []);
  const acc = useMemo(() => new Color(accent), [accent]);
  const startColors = useMemo(() => bulbMatrices.map((_, i) => (i % 3 === 0 ? acc : warm)), [acc, warm]);
  const c = useMemo(() => new Color(), []);
  useFrame(() => {
    const m = bulbs.current;
    if (!m) return;
    const l = lightsRef.current;
    const p = l?.signal.pulse ?? 0;
    const k = (0.7 + 0.6 * p) * (1 - 0.8 * (l?.blackout ?? 0));
    for (let i = 0; i < BULBS; i++) m.setColorAt(i, c.copy(i % 3 === 0 ? acc : warm).multiplyScalar(k));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      {[-5.8, 5.8].map((x) => (
        <mesh key={x} position={[x, 1.7, 2.6]}>
          <cylinderGeometry args={[0.05, 0.06, 3.9, 6]} />
          <meshStandardMaterial color="#3a2a1c" roughness={0.8} />
        </mesh>
      ))}
      <Instances matrices={bulbMatrices} colors={startColors} meshRef={bulbs}>
        <sphereGeometry args={[0.055, 8, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </Instances>
    </group>
  );
}
