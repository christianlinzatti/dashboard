"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  type Matrix4,
  RepeatWrapping,
  SRGBColorSpace,
  type ShaderMaterial,
} from "three";
import { rng } from "@/lib/dance/rng";
import { TRUSS_Y, TRUSS_Z } from "../layout";
import { Instances, mat, songSeconds, type VenueProps, type Xf } from "./shared";

/** Tribünen ringsum (Stufen), darauf ein Lichtermeer aus Handys; vier Flutlichtmasten. */
export function Stadium({ accent, lightsRef }: VenueProps) {
  const STEPS = 7;
  const SEGMENTS = 40;
  const tiers = useMemo(() => {
    const mats: Matrix4[] = [];
    for (let s = 0; s < STEPS; s++)
      for (let k = 0; k < SEGMENTS; k++) {
        // vorne offen (Bühne steht an der Stirnseite): Bogen von -150° bis +150° um die Blickrichtung zum Publikum
        const a = ((k + 0.5) / SEGMENTS - 0.5) * ((300 * Math.PI) / 180);
        const r = 21 + s * 1.3;
        mats.push(
          mat({
            p: [Math.sin(a) * r, 0.6 + s * 0.9, Math.cos(a) * r + 4],
            r: [0, a, 0],
            s: [(2 * Math.PI * r * (300 / 360)) / SEGMENTS + 0.05, 1.2, 1.3],
          }),
        );
      }
    return mats;
  }, []);

  // Lichtermeer auf den Tribünen
  const sea = useMemo(() => {
    const r = rng("stadion-lichter");
    const n = 1400;
    const pos = new Float32Array(n * 3);
    const tw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = Math.floor(r.next() * STEPS);
      const a = (r.next() - 0.5) * ((296 * Math.PI) / 180);
      const rad = 21 + s * 1.3 + (r.next() - 0.5) * 0.6;
      pos.set([Math.sin(a) * rad, 1.6 + s * 0.9 + r.next() * 0.3, Math.cos(a) * rad + 4], i * 3);
      tw[i] = r.next();
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("aTw", new BufferAttribute(tw, 1));
    return g;
  }, []);
  useEffect(() => () => sea.dispose(), [sea]);
  const seaMat = useRef<ShaderMaterial>(null);
  const seaUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uColor: { value: new Color(accent) }, uLevel: { value: 1 } }),
    [accent],
  );
  useFrame(() => {
    const u = seaMat.current?.uniforms;
    if (!u) return;
    u.uTime!.value = songSeconds();
    u.uLevel!.value = 0.5 + 0.5 * (1 - (lightsRef.current?.blackout ?? 0));
  });

  return (
    <group>
      <Instances matrices={tiers}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#3a4058" emissive="#0d1120" roughness={0.9} />
      </Instances>
      <points geometry={sea} frustumCulled={false}>
        <shaderMaterial
          ref={seaMat}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
          args={[
            {
              uniforms: seaUniforms,
              vertexShader: /* glsl */ `
                attribute float aTw; uniform float uTime; varying float vB; varying float vC;
                void main() {
                  vB = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * (0.8 + aTw * 2.0) + aTw * 60.0), 3.0);
                  vC = step(0.75, aTw);
                  vec4 mv = modelViewMatrix * vec4(position, 1.0);
                  gl_Position = projectionMatrix * mv;
                  gl_PointSize = 160.0 / max(-mv.z, 1.0);
                }
              `,
              fragmentShader: /* glsl */ `
                uniform vec3 uColor; uniform float uLevel; varying float vB; varying float vC;
                void main() {
                  float d = length(gl_PointCoord - 0.5);
                  vec3 c = mix(vec3(0.9, 0.95, 1.0), uColor, vC);
                  gl_FragColor = vec4(c * vB * uLevel * 1.4 * smoothstep(0.5, 0.05, d), 1.0);
                }
              `,
            },
          ]}
        />
      </points>
      <FloodLights />
      {/* Rasen unter dem Publikum */}
      <Turf />
    </group>
  );
}

const FLOODS = [
  [-17, -6],
  [17, -6],
  [-19, 14],
  [19, 14],
].map(([x, z]) => ({ p: [x!, 0, z!], r: [0, Math.atan2(-x!, -z! + 2), 0] }) satisfies Xf);
const poleMatrices = FLOODS.map((f) => mat(f, { p: [0, 8, 0] }));
const housingMatrices = FLOODS.map((f) => mat(f, { p: [0, 16.4, 0.3], r: [0.35, 0, 0] }));
const lampMatrices = FLOODS.map((f) => mat(f, { p: [0, 16.4, 0.44], r: [0.35, 0, 0] }));

/** Vier Flutlichtmasten, zur Bühne gedreht; das Lampenfeld leuchtet (Bloom macht den Hof) */
function FloodLights() {
  return (
    <group>
      <Instances matrices={poleMatrices}>
        <cylinderGeometry args={[0.18, 0.3, 16, 8]} />
        <meshStandardMaterial color="#2a2c34" metalness={0.6} roughness={0.5} />
      </Instances>
      <Instances matrices={housingMatrices}>
        <boxGeometry args={[3.2, 1.6, 0.25]} />
        <meshStandardMaterial color="#20222a" metalness={0.5} roughness={0.5} />
      </Instances>
      <Instances matrices={lampMatrices}>
        <planeGeometry args={[2.9, 1.3]} />
        <meshBasicMaterial color="#cfe0ff" toneMapped={false} />
      </Instances>
    </group>
  );
}

const TOWER_X = [-6.6, 6.6];
const legMatrices = TOWER_X.flatMap((x) => [-0.45, 0.45].map((dz) => mat({ p: [x, 3.6, dz] })));
/** PA: zwei Line-Arrays je Seite, jedes aus sechs leicht nach unten geneigten Boxen */
const speakerMatrices = TOWER_X.flatMap((x) =>
  [0, 1].flatMap((k) =>
    [0, 1, 2, 3, 4, 5].map((i) => mat({ p: [x * (0.8 - k * 0.1), 5.4 - i * 0.32, 1.1 + i * 0.03], r: [i * 0.05, 0, 0] })),
  ),
);

/** Stadionbühne: zwei hohe Türme mit PA, darüber ein breites Dach; die Front-Traverse trägt Lampen und Blinder. */
export function StadiumRoof() {
  const steel = <meshStandardMaterial color="#30323c" metalness={0.8} roughness={0.35} />;
  return (
    <group position={[0, 0, TRUSS_Z]}>
      <Instances matrices={legMatrices}>
        <boxGeometry args={[0.22, 7.2, 0.22]} />
        {steel}
      </Instances>
      <Instances matrices={speakerMatrices}>
        <boxGeometry args={[0.7, 0.3, 0.45]} />
        <meshStandardMaterial color="#101015" roughness={0.7} />
      </Instances>
      <mesh position={[0, 7.3, 0]}>
        <boxGeometry args={[14.5, 0.4, 1.4]} />
        {steel}
      </mesh>
      <mesh position={[0, TRUSS_Y, 0.25]}>
        <boxGeometry args={[12.5, 0.2, 0.2]} />
        {steel}
      </mesh>
    </group>
  );
}

function Turf() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? "#0d2412" : "#10301a";
      g.fillRect(0, i * 16, 128, 16);
    }
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(4, 4);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.255, 12]}>
      <planeGeometry args={[40, 30]} />
      <meshStandardMaterial map={tex} roughness={0.95} />
    </mesh>
  );
}
