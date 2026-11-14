"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Object3D,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type ShaderMaterial,
  type SpotLight,
} from "three";
import type { LightFrame } from "@/lib/stage/lights";
import { TRUSS_Y, TRUSS_Z } from "./StageSet";

const BEAM_LENGTH = 7;

/** Volumetrischer Lichtkegel (Fake): additiver Kegel, zum Ende und zu den Rändern ausblendend. */
const beamShader = {
  vertexShader: /* glsl */ `
    varying float vLen; varying vec3 vNormalV; varying vec3 vView;
    void main() {
      vLen = uv.y;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormalV = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uIntensity;
    varying float vLen; varying vec3 vNormalV; varying vec3 vView;
    void main() {
      float edge = pow(abs(dot(vNormalV, vView)), 1.6);
      float fall = pow(vLen, 1.8);
      gl_FragColor = vec4(uColor * edge * fall * uIntensity * 0.55, 1.0);
    }
  `,
};

/** Moving Heads an der Traverse: Schwenk/Neigung/Farbe/Helligkeit aus dem LightDirector. */
export function MovingHeads({
  count,
  realLights,
  lightsRef,
}: {
  count: number;
  realLights: number;
  lightsRef: React.RefObject<LightFrame | null>;
}) {
  const xs = useMemo(
    () => Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * (9 / Math.max(count - 1, 1))),
    [count],
  );
  return (
    <group position={[0, TRUSS_Y - 0.2, TRUSS_Z + 0.25]}>
      {xs.map((x, i) => (
        <Head
          key={i}
          index={i}
          x={x}
          real={i >= (count - realLights) / 2 && i < (count + realLights) / 2}
          lightsRef={lightsRef}
        />
      ))}
    </group>
  );
}

function Head({
  index,
  x,
  real,
  lightsRef,
}: {
  index: number;
  x: number;
  real: boolean;
  lightsRef: React.RefObject<LightFrame | null>;
}) {
  const yoke = useRef<Group>(null);
  const beam = useRef<Mesh>(null);
  const light = useRef<SpotLight>(null);
  const target = useMemo(() => new Object3D(), []);
  const mat = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uColor: { value: new Color() }, uIntensity: { value: 0 } }), []);

  useFrame(() => {
    const h = lightsRef.current?.heads[index];
    if (!h || !yoke.current) return;
    yoke.current.rotation.set(h.tilt, h.pan, 0, "YXZ");
    const u = mat.current?.uniforms;
    if (u) {
      (u.uColor!.value as Color).set(h.color);
      u.uIntensity!.value = h.intensity;
    }
    if (beam.current) beam.current.visible = h.intensity > 0.01;
    if (light.current) {
      light.current.color.set(h.color);
      light.current.intensity = h.intensity * 80;
      // Ziel entlang der Strahlrichtung
      yoke.current.updateWorldMatrix(true, false);
      target.position.set(0, -BEAM_LENGTH, 0).applyMatrix4(yoke.current.matrixWorld);
      target.updateMatrixWorld();
    }
  });

  return (
    <group position-x={x}>
      <mesh>
        <boxGeometry args={[0.32, 0.18, 0.32]} />
        <meshStandardMaterial color="#15151b" metalness={0.7} roughness={0.4} />
      </mesh>
      <group ref={yoke}>
        <mesh position-y={-0.18}>
          <cylinderGeometry args={[0.12, 0.16, 0.26, 16]} />
          <meshStandardMaterial color="#1d1d24" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh ref={beam} position-y={-0.3 - BEAM_LENGTH / 2}>
          {/* Spitze oben (uv.y = 1 an der Basis des Zylinders → hell an der Lampe) */}
          <cylinderGeometry args={[0.06, 0.9, BEAM_LENGTH, 24, 1, true]} />
          <shaderMaterial
            ref={mat}
            args={[{ ...beamShader, uniforms }]}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      </group>
      {real && (
        <>
          <primitive object={target} />
          <spotLight ref={light} target={target} angle={0.22} penumbra={0.5} distance={14} intensity={0} />
        </>
      )}
    </group>
  );
}

/** Laser-Fächer von der Traverse – nur bei hoher Energie (Refrain, Drop). */
export function Lasers({ count, lightsRef }: { count: number; lightsRef: React.RefObject<LightFrame | null> }) {
  const group = useRef<Group>(null);
  const beams = useRef<Array<Group | null>>([]);
  useFrame(() => {
    const l = lightsRef.current?.lasers;
    if (!l || !group.current) return;
    group.current.visible = l.on;
    if (!l.on) return;
    group.current.rotation.z = l.rotation;
    beams.current.forEach((g, i) => {
      if (!g) return;
      const a = ((i / Math.max(count - 1, 1)) * 2 - 1) * l.spread;
      g.rotation.set(-0.35, 0, a);
      const mat = (g.children[0] as Mesh).material as MeshBasicMaterial;
      mat.color.set(l.color);
      mat.opacity = l.intensity * 0.8;
    });
  });
  return (
    <group ref={group} position={[0, TRUSS_Y - 0.1, TRUSS_Z]}>
      {Array.from({ length: count }, (_, i) => (
        // Drehpunkt an der Traverse, Strahl nach unten/vorn
        <group key={i} ref={(g) => void (beams.current[i] = g)}>
          <mesh position-y={-7}>
            <boxGeometry args={[0.025, 14, 0.025]} />
            <meshBasicMaterial transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
