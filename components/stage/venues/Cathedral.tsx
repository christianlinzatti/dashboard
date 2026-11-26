"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, Color, DoubleSide, type InstancedMesh, Matrix4, type ShaderMaterial } from "three";
import { rng } from "@/lib/dance/rng";
import { TRUSS_Z } from "../layout";
import { concreteTexture, Instances, mat, plainVertex, songSeconds, type VenueProps } from "./shared";
import { useShaderArgs } from "../shader-args";

/** Rosettenfenster aus Buntglas: Speichen, Ringe und Bleiruten; leuchtet von hinten und pulsiert sacht. */
const roseShader = /* glsl */ `
  uniform float uTime, uLevel; uniform vec3 uA, uB, uC; varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    if (r > 1.0) discard;
    float a = atan(p.y, p.x);
    float petals = 12.0;
    float seg = floor((a / 6.2831 + 0.5) * petals);
    float ring = floor(r * 4.0);
    float h = fract(sin(seg * 12.9 + ring * 78.2) * 43758.5);
    vec3 glass = h < 0.33 ? uA : h < 0.66 ? uB : uC;
    // Bleiruten: Speichen, Ringe, Rand
    float spoke = abs(fract((a / 6.2831 + 0.5) * petals) - 0.5);
    float lead = max(smoothstep(0.44, 0.48, abs(fract(r * 4.0) - 0.5)), smoothstep(0.42, 0.48, spoke) * step(0.12, r));
    lead = max(lead, smoothstep(0.94, 0.97, r));
    float glow = 0.8 + 0.2 * sin(uTime * 0.7 + seg);
    gl_FragColor = vec4(mix(glass * glow * uLevel, vec3(0.02), clamp(lead, 0.0, 1.0)), 1.0);
  }
`;

/** Spitzbogenfenster: oben zwei Kreisbögen, Buntglas in Feldern mit Bleiruten */
const archShader = /* glsl */ `
  uniform float uLevel; uniform vec3 uA, uB; varying vec2 vUv;
  void main() {
    vec2 p = vUv - vec2(0.5, 0.0);
    if (vUv.y > 0.72 && (length(p - vec2(-0.5, 0.72)) > 1.0 || length(p - vec2(0.5, 0.72)) > 1.0)) discard;
    float cell = fract(sin(floor(vUv.x * 3.0) * 7.1 + floor(vUv.y * 8.0) * 3.7) * 4375.5);
    float lead = step(0.92, fract(vUv.x * 3.0)) + step(0.94, fract(vUv.y * 8.0));
    vec3 c = mix(uA, uB, step(0.5, cell)) * 0.7 * uLevel;
    gl_FragColor = vec4(mix(c, vec3(0.02), clamp(lead, 0.0, 1.0)), 1.0);
  }
`;

const COLUMNS = [-7, 7].flatMap((x) => [-1.5, 2.5, 6.5, 10.5].map((z) => [x, z] as const));

/**
 * Steinerne Rückwand mit Rosette und Orgelpfeifen, Spitzbogenfenster, Säulen ins Kirchenschiff und Kerzen.
 * Wiederholte Teile (Pfeifen, Säulen, Kerzen) liegen je in einem `instancedMesh`: wenige Zeichenaufrufe für den Pi.
 */
export function Cathedral({ lightsRef, accent }: VenueProps) {
  const stone = useMemo(() => {
    const t = concreteTexture("kirchenstein");
    t.repeat.set(6, 3);
    return t;
  }, []);
  useEffect(() => () => stone.dispose(), [stone]);
  const rose = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLevel: { value: 1 },
      uA: { value: new Color("#2a4bd8") },
      uB: { value: new Color("#d8322a") },
      uC: { value: new Color(accent) },
    }),
    [accent],
  );

  const pipes = useMemo(
    () =>
      Array.from({ length: 23 }, (_, i) => {
        const h = 1.1 + Math.pow(1 - Math.abs(i - 11) / 11, 1.5) * 1.6;
        return mat({ p: [(i - 11) * 0.2, h / 2 + 0.2, TRUSS_Z - 0.45], s: [1, h, 1] });
      }),
    [],
  );
  const shafts = useMemo(() => COLUMNS.map(([x, z]) => mat({ p: [x, 4, z] })), []);
  const capitals = useMemo(() => COLUMNS.map(([x, z]) => mat({ p: [x, 8.3, z] })), []);

  const candles = useMemo(() => {
    const r = rng("kerzen");
    return Array.from({ length: 28 }, (_, i) => {
      const side = i % 2 ? 1 : -1;
      return [side * (4.6 + r.next() * 1.2), 0.22 + r.next() * 0.5, -1.8 + r.next() * 5] as const;
    });
  }, []);
  const sticks = useMemo(() => candles.map(([x, h, z]) => mat({ p: [x, h / 2, z], s: [1, h, 1] })), [candles]);
  const flameAt = useMemo(() => candles.map(([x, h, z]) => mat({ p: [x, h + 0.04, z] })), [candles]);
  const halos = useMemo(() => candles.map(([x, h, z]) => mat({ p: [x, h + 0.05, z] })), [candles]);

  const flames = useRef<InstancedMesh>(null);
  const flick = useMemo(() => new Matrix4(), []);
  useFrame(() => {
    const t = songSeconds();
    const l = lightsRef.current;
    const u = rose.current?.uniforms;
    if (u) {
      u.uTime!.value = t;
      u.uLevel!.value = (0.75 + 0.35 * (l?.signal.pulse ?? 0)) * (1 - 0.7 * (l?.blackout ?? 0));
    }
    // Flammen flackern: nur die Höhe ändert sich
    const m = flames.current;
    if (!m) return;
    candles.forEach(([x, h, z], i) => {
      const f = 0.85 + 0.15 * Math.sin(t * 11 + i * 3.1) * Math.sin(t * 7.3 + i);
      m.setMatrixAt(i, flick.makeScale(1, f, 1).setPosition(x, h + 0.04, z));
    });
    m.instanceMatrix.needsUpdate = true;
  });

  const shaderArgs1 = useShaderArgs({ uniforms, vertexShader: plainVertex, fragmentShader: roseShader });
  const shaderArgs2 = useShaderArgs({ uniforms, vertexShader: plainVertex, fragmentShader: archShader });
  return (
    <group>
      {/* Rückwand aus Stein mit Rosette, Orgelpfeifen davor */}
      <mesh position={[0, 4, TRUSS_Z - 0.8]}>
        <planeGeometry args={[20, 10]} />
        <meshStandardMaterial map={stone} color="#6a6470" roughness={0.95} />
      </mesh>
      <mesh position={[0, 4.15, TRUSS_Z - 0.75]}>
        <planeGeometry args={[3.4, 3.4]} />
        <shaderMaterial ref={rose} args={shaderArgs1} toneMapped={false} />
      </mesh>
      <Instances matrices={pipes}>
        <cylinderGeometry args={[0.075, 0.075, 1, 10]} />
        <meshStandardMaterial color="#b9a37a" metalness={0.85} roughness={0.3} />
      </Instances>
      {/* Spitzbogenfenster seitlich */}
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 3.6, TRUSS_Z - 0.76]}>
          <planeGeometry args={[1.1, 3.4]} />
          <shaderMaterial args={shaderArgs2} toneMapped={false} />
        </mesh>
      ))}
      {/* Säulen links und rechts, nach vorn ins Kirchenschiff */}
      <Instances matrices={shafts}>
        <cylinderGeometry args={[0.45, 0.5, 8.5, 16]} />
        <meshStandardMaterial map={stone} color="#77707e" roughness={0.9} />
      </Instances>
      <Instances matrices={capitals}>
        <boxGeometry args={[1.2, 0.3, 1.2]} />
        <meshStandardMaterial map={stone} color="#77707e" roughness={0.9} />
      </Instances>
      {/* Kerzen auf Ständern seitlich der Bühne */}
      <Instances matrices={sticks}>
        <cylinderGeometry args={[0.035, 0.035, 1, 8]} />
        <meshStandardMaterial color="#efe6d2" roughness={0.6} />
      </Instances>
      <Instances matrices={flameAt} meshRef={flames}>
        <coneGeometry args={[0.022, 0.08, 8]} />
        <meshBasicMaterial color="#ffc35a" toneMapped={false} />
      </Instances>
      <Instances matrices={halos}>
        <planeGeometry args={[0.3, 0.3]} />
        <meshBasicMaterial
          color="#ff9a3a"
          transparent
          opacity={0.25}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </Instances>
    </group>
  );
}
