"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  type InstancedMesh,
  type Matrix4,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  type Mesh,
  type ShaderMaterial,
} from "three";
import { rng } from "@/lib/dance/rng";
import { songContext } from "@/lib/song-context/store";
import type { LightFrame } from "@/lib/stage/lights";
import { TRUSS_Y, TRUSS_Z } from "./StageSet";

/**
 * Kulissen der großen Bühnen: Stadion, Strand, Lagerhalle, Kathedrale. Einfache Formen und kleine Shader wie die
 * übrige Bühne (läuft auf dem Pi), Bewegung aus der Songzeit.
 */

const songSeconds = () => songContext.getState().positionMs / 1000;

const plainVertex = /* glsl */ `
  varying vec2 vUv; varying vec3 vPos; varying vec3 vWorld;
  void main() {
    vUv = uv; vPos = position; vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ———————————————————————————————————————— Stadion ————————————————————————————————————————

/** Tribünen ringsum (Stufen), darauf ein Lichtermeer aus Handys; vier Flutlichtmasten. */
export function Stadium({ accent, lightsRef }: { accent: string; lightsRef: React.RefObject<LightFrame | null> }) {
  const STEPS = 7;
  const SEGMENTS = 40;
  const tiers = useMemo(() => {
    const o = new Object3D();
    const mats: Matrix4[] = [];
    for (let s = 0; s < STEPS; s++)
      for (let k = 0; k < SEGMENTS; k++) {
        // vorne offen (Bühne steht an der Stirnseite): Bogen von -150° bis +150° um die Blickrichtung zum Publikum
        const a = ((k + 0.5) / SEGMENTS - 0.5) * ((300 * Math.PI) / 180);
        const r = 21 + s * 1.3;
        o.position.set(Math.sin(a) * r, 0.6 + s * 0.9, Math.cos(a) * r + 4);
        o.rotation.set(0, a, 0);
        o.scale.set((2 * Math.PI * r * (300 / 360)) / SEGMENTS + 0.05, 1.2, 1.3);
        o.updateMatrix();
        mats.push(o.matrix.clone());
      }
    return mats;
  }, []);
  const tierMesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const m = tierMesh.current;
    if (!m) return;
    tiers.forEach((mat, i) => m.setMatrixAt(i, mat));
    m.instanceMatrix.needsUpdate = true;
  }, [tiers]);

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
      <instancedMesh ref={tierMesh} args={[undefined, undefined, STEPS * SEGMENTS]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#3a4058" emissive="#0d1120" roughness={0.9} />
      </instancedMesh>
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
      {[
        [-17, -6],
        [17, -6],
        [-19, 14],
        [19, 14],
      ].map(([x, z]) => (
        <FloodLight key={`${x}${z}`} x={x!} z={z!} />
      ))}
      {/* Rasen unter dem Publikum */}
      <Turf />
    </group>
  );
}

/** Stadionbühne: zwei hohe Türme mit PA, darüber ein breites Dach; die Front-Traverse trägt Lampen und Blinder. */
export function StadiumRoof() {
  const steel = <meshStandardMaterial color="#30323c" metalness={0.8} roughness={0.35} />;
  const box = <meshStandardMaterial color="#101015" roughness={0.7} />;
  return (
    <group position={[0, 0, TRUSS_Z]}>
      {[-6.6, 6.6].map((x) => (
        <group key={x}>
          {[-0.45, 0.45].map((dz) => (
            <mesh key={dz} position={[x, 3.6, dz]}>
              <boxGeometry args={[0.22, 7.2, 0.22]} />
              {steel}
            </mesh>
          ))}
          {/* PA: zwei Line-Arrays je Seite */}
          {[0, 1].map((k) =>
            [0, 1, 2, 3, 4, 5].map((i) => (
              <mesh key={`${k}${i}`} position={[x * (0.8 - k * 0.1), 5.4 - i * 0.32, 1.1 + i * 0.03]} rotation-x={i * 0.05}>
                <boxGeometry args={[0.7, 0.3, 0.45]} />
                {box}
              </mesh>
            )),
          )}
        </group>
      ))}
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

function FloodLight({ x, z }: { x: number; z: number }) {
  const yaw = Math.atan2(-x, -z + 2);
  return (
    <group position={[x, 0, z]} rotation-y={yaw}>
      <mesh position-y={8}>
        <cylinderGeometry args={[0.18, 0.3, 16, 8]} />
        <meshStandardMaterial color="#2a2c34" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 16.4, 0.3]} rotation-x={0.35}>
        <boxGeometry args={[3.2, 1.6, 0.25]} />
        <meshStandardMaterial color="#20222a" metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Lampenfeld: leuchtet (Bloom macht den Hof) */}
      <mesh position={[0, 16.4, 0.44]} rotation-x={0.35}>
        <planeGeometry args={[2.9, 1.3]} />
        <meshBasicMaterial color="#cfe0ff" toneMapped={false} />
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

// ———————————————————————————————————————— Strand ————————————————————————————————————————

/** Meer bis zum Horizont mit Sonnenglitzern, tiefstehende Sonne, Palmen und Lichterketten. */
export function Beach({ accent, lightsRef }: { accent: string; lightsRef: React.RefObject<LightFrame | null> }) {
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
      {[
        [-6.2, -1.5, 0.25, 6.2],
        [-7.6, 1.6, -0.15, 5.4],
        [6.4, -2.2, -0.3, 6.8],
        [7.4, 1.4, 0.2, 5.0],
        [-9.5, -5, 0.1, 7.2],
        [10, -4.6, -0.2, 6.4],
      ].map(([x, z, lean, h], i) => (
        <Palm key={i} x={x!} z={z!} lean={lean!} height={h!} seed={i} />
      ))}
      <StringLights accent={accent} lightsRef={lightsRef} />
    </group>
  );
}

function Palm({ x, z, lean, height, seed }: { x: number; z: number; lean: number; height: number; seed: number }) {
  const segs = 7;
  const fronds = useMemo(() => {
    const r = rng(`palme-${seed}`);
    return Array.from({ length: 8 }, (_, i) => ({ yaw: (i / 8) * Math.PI * 2 + r.next() * 0.4, droop: 0.5 + r.next() * 0.5 }));
  }, [seed]);
  const trunk = Array.from({ length: segs }, (_, i) => {
    const u = (i + 0.5) / segs;
    return { y: u * height, x: Math.sin(u * 1.4) * lean * height * 0.35, r: 0.2 - u * 0.08 };
  });
  const top = trunk[segs - 1]!;
  return (
    <group position={[x, -0.25, z]}>
      {trunk.map((t, i) => (
        <mesh key={i} position={[t.x, t.y, 0]} rotation-z={-lean * 0.6}>
          <cylinderGeometry args={[t.r * 0.9, t.r, height / segs + 0.04, 8]} />
          <meshStandardMaterial color="#2a1b12" roughness={0.9} />
        </mesh>
      ))}
      <group position={[top.x, height, 0]}>
        {fronds.map((f, i) => (
          <group key={i} rotation={[0, f.yaw, 0]}>
            <mesh position={[0.9, -0.25 * f.droop, 0]} rotation={[0, 0, -0.35 * f.droop]}>
              <boxGeometry args={[1.9, 0.03, 0.42]} />
              <meshStandardMaterial color="#0f2416" roughness={0.8} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/** Lichterkette in einem Bogen über die Bühnenfront, Birnchen glimmen im Takt */
function StringLights({ accent, lightsRef }: { accent: string; lightsRef: React.RefObject<LightFrame | null> }) {
  const N = 26;
  const bulbs = useMemo(
    () =>
      Array.from({ length: N }, (_, i) => {
        const u = i / (N - 1);
        const x = -5.6 + u * 11.2;
        return [x, 3.6 - Math.sin(u * Math.PI) * 0.9, 2.6 - Math.sin(u * Math.PI) * 0.6] as const;
      }),
    [],
  );
  const mats = useRef<Array<{ color: Color } | null>>([]);
  const warm = useMemo(() => new Color("#ffd28a"), []);
  const acc = useMemo(() => new Color(accent), [accent]);
  useFrame(() => {
    const l = lightsRef.current;
    const p = l?.signal.pulse ?? 0;
    const k = (0.7 + 0.6 * p) * (1 - 0.8 * (l?.blackout ?? 0));
    mats.current.forEach((m, i) => m?.color.copy(i % 3 === 0 ? acc : warm).multiplyScalar(k));
  });
  return (
    <group>
      {[-5.8, 5.8].map((x) => (
        <mesh key={x} position={[x, 1.7, 2.6]}>
          <cylinderGeometry args={[0.05, 0.06, 3.9, 6]} />
          <meshStandardMaterial color="#3a2a1c" roughness={0.8} />
        </mesh>
      ))}
      {bulbs.map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[0.055, 8, 6]} />
          <meshBasicMaterial ref={(m) => void (mats.current[i] = m)} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

// ———————————————————————————————————————— Lagerhalle ————————————————————————————————————————

function concreteTexture(seed: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const r = rng(seed);
  g.fillStyle = "#3c3b3a";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 40 + r.next() * 40;
    g.fillStyle = `rgba(${v},${v},${v - 3},${0.12 + r.next() * 0.2})`;
    g.fillRect(r.next() * 256, r.next() * 256, 1 + r.next() * 3, 1 + r.next() * 3);
  }
  // Schalungsfugen
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (let i = 0; i < 4; i++) g.fillRect(0, i * 64, 256, 2);
  g.fillRect(127, 0, 2, 256);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Rohe Betonwand mit senkrechten Leuchtröhren (blitzen im Takt), Stahlträger unter der Decke, Säulen. */
export function Warehouse({ lightsRef, accent }: { lightsRef: React.RefObject<LightFrame | null>; accent: string }) {
  const tex = useMemo(() => {
    const t = concreteTexture("beton-wand");
    t.repeat.set(4, 2);
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  const TUBES = 10;
  const tubes = useRef<Array<{ color: Color } | null>>([]);
  const red = useMemo(() => new Color(accent), [accent]);
  const white = useMemo(() => new Color("#f4f4ff"), []);
  useFrame(() => {
    const l = lightsRef.current;
    const t = songSeconds();
    const p = l?.signal.pulse ?? 0;
    const chase = l?.signal.chase ?? -1;
    tubes.current.forEach((m, i) => {
      if (!m) return;
      // Lauflicht beim großen Einsatz, sonst abwechselnd rot/weiß im Takt
      const on =
        chase >= 0 ? (Math.abs(i / (TUBES - 1) - chase) < 0.15 ? 1 : 0.1) : 0.35 + 0.65 * p * ((i + Math.floor(t * 2)) % 2);
      m.color.copy(i % 2 ? red : white).multiplyScalar(on * 1.6 * (1 - 0.9 * (l?.blackout ?? 0)));
    });
  });
  return (
    <group>
      <mesh position={[0, 3, TRUSS_Z - 0.7]}>
        <planeGeometry args={[18, 8]} />
        <meshStandardMaterial map={tex} roughness={0.95} color="#9a9a9a" />
      </mesh>
      {Array.from({ length: TUBES }, (_, i) => (
        <mesh key={i} position={[-5.4 + (i * 10.8) / (TUBES - 1), 2.4, TRUSS_Z - 0.6]}>
          <boxGeometry args={[0.07, 3.8, 0.07]} />
          <meshBasicMaterial ref={(m) => void (tubes.current[i] = m)} toneMapped={false} />
        </mesh>
      ))}
      {/* Säulen und Seitenwände */}
      {[-7.5, 7.5].map((x) => (
        <group key={x}>
          {[-1.5, 3.5, 8.5].map((z) => (
            <mesh key={z} position={[x, 3, z]}>
              <boxGeometry args={[0.6, 6.5, 0.6]} />
              <meshStandardMaterial map={tex} roughness={0.95} color="#7d7d7d" />
            </mesh>
          ))}
        </group>
      ))}
      {/* Stahlträger unter der Decke (I-Profile) */}
      {[-1.8, 1.4, 4.6, 7.8].map((z) => (
        <group key={z} position={[0, 6.1, z]}>
          <mesh>
            <boxGeometry args={[16, 0.5, 0.06]} />
            <meshStandardMaterial color="#26262b" metalness={0.8} roughness={0.45} />
          </mesh>
          {[-0.25, 0.25].map((y) => (
            <mesh key={y} position-y={y}>
              <boxGeometry args={[16, 0.05, 0.32]} />
              <meshStandardMaterial color="#26262b" metalness={0.8} roughness={0.45} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Traverse für die Lampen */}
      <mesh position={[0, TRUSS_Y, TRUSS_Z]}>
        <boxGeometry args={[11, 0.18, 0.18]} />
        <meshStandardMaterial color="#2a2a33" metalness={0.8} roughness={0.35} />
      </mesh>
    </group>
  );
}

// ———————————————————————————————————————— Kathedrale ————————————————————————————————————————

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

export function Cathedral({ lightsRef, accent }: { lightsRef: React.RefObject<LightFrame | null>; accent: string }) {
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
  const flames = useRef<Array<Mesh | null>>([]);
  useFrame(() => {
    const t = songSeconds();
    const l = lightsRef.current;
    const u = rose.current?.uniforms;
    if (u) {
      u.uTime!.value = t;
      u.uLevel!.value = (0.75 + 0.35 * (l?.signal.pulse ?? 0)) * (1 - 0.7 * (l?.blackout ?? 0));
    }
    flames.current.forEach((m, i) => {
      if (!m) return;
      const f = 0.85 + 0.15 * Math.sin(t * 11 + i * 3.1) * Math.sin(t * 7.3 + i);
      m.scale.set(1, f, 1);
    });
  });
  const pipes = useMemo(() => Array.from({ length: 23 }, (_, i) => 1.1 + Math.pow(1 - Math.abs(i - 11) / 11, 1.5) * 1.6), []);
  const candles = useMemo(() => {
    const r = rng("kerzen");
    return Array.from({ length: 28 }, (_, i) => {
      const side = i % 2 ? 1 : -1;
      return [side * (4.6 + r.next() * 1.2), 0.22 + r.next() * 0.5, -1.8 + r.next() * 5] as const;
    });
  }, []);
  return (
    <group>
      {/* Rückwand aus Stein mit Rosette, Orgelpfeifen davor */}
      <mesh position={[0, 4, TRUSS_Z - 0.8]}>
        <planeGeometry args={[20, 10]} />
        <meshStandardMaterial map={stone} color="#6a6470" roughness={0.95} />
      </mesh>
      <mesh position={[0, 4.15, TRUSS_Z - 0.75]}>
        <planeGeometry args={[3.4, 3.4]} />
        <shaderMaterial
          ref={rose}
          args={[{ uniforms, vertexShader: plainVertex, fragmentShader: roseShader }]}
          toneMapped={false}
        />
      </mesh>
      {pipes.map((h, i) => (
        <mesh key={i} position={[(i - 11) * 0.2, h / 2 + 0.2, TRUSS_Z - 0.45]}>
          <cylinderGeometry args={[0.075, 0.075, h, 10]} />
          <meshStandardMaterial color="#b9a37a" metalness={0.85} roughness={0.3} />
        </mesh>
      ))}
      {/* Spitzbogenfenster seitlich */}
      {[-6, 6].map((x) => (
        <mesh key={x} position={[x, 3.6, TRUSS_Z - 0.76]}>
          <planeGeometry args={[1.1, 3.4]} />
          <shaderMaterial
            args={[
              {
                uniforms,
                vertexShader: plainVertex,
                fragmentShader: /* glsl */ `
                  uniform float uLevel; uniform vec3 uA, uB; varying vec2 vUv;
                  void main() {
                    vec2 p = vUv - vec2(0.5, 0.0);
                    // Spitzbogen: oben zwei Kreisbögen
                    if (vUv.y > 0.72 && (length(p - vec2(-0.5, 0.72)) > 1.0 || length(p - vec2(0.5, 0.72)) > 1.0)) discard;
                    float cell = fract(sin(floor(vUv.x * 3.0) * 7.1 + floor(vUv.y * 8.0) * 3.7) * 4375.5);
                    float lead = step(0.92, fract(vUv.x * 3.0)) + step(0.94, fract(vUv.y * 8.0));
                    vec3 c = mix(uA, uB, step(0.5, cell)) * 0.7 * uLevel;
                    gl_FragColor = vec4(mix(c, vec3(0.02), clamp(lead, 0.0, 1.0)), 1.0);
                  }
                `,
              },
            ]}
            toneMapped={false}
          />
        </mesh>
      ))}
      {/* Säulen links und rechts, nach vorn ins Kirchenschiff */}
      {[-7, 7].map((x) =>
        [-1.5, 2.5, 6.5, 10.5].map((z) => (
          <group key={`${x}${z}`} position={[x, 0, z]}>
            <mesh position-y={4}>
              <cylinderGeometry args={[0.45, 0.5, 8.5, 16]} />
              <meshStandardMaterial map={stone} color="#77707e" roughness={0.9} />
            </mesh>
            <mesh position-y={8.3}>
              <boxGeometry args={[1.2, 0.3, 1.2]} />
              <meshStandardMaterial map={stone} color="#77707e" roughness={0.9} />
            </mesh>
          </group>
        )),
      )}
      {/* Kerzen auf Ständern seitlich der Bühne */}
      {candles.map(([x, h, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position-y={h / 2}>
            <cylinderGeometry args={[0.035, 0.035, h, 8]} />
            <meshStandardMaterial color="#efe6d2" roughness={0.6} />
          </mesh>
          <mesh ref={(m) => void (flames.current[i] = m)} position-y={h + 0.04}>
            <coneGeometry args={[0.022, 0.08, 8]} />
            <meshBasicMaterial color="#ffc35a" toneMapped={false} />
          </mesh>
          <mesh position-y={h + 0.05}>
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
          </mesh>
        </group>
      ))}
    </group>
  );
}
