"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Object3D,
  Vector3,
  type Group,
  type Mesh,
  MeshBasicMaterial,
  type PointLight,
  type Points,
  type ShaderMaterial,
  type SpotLight,
} from "three";
import type { LightFrame } from "@/lib/stage/lights";
import { songContext } from "@/lib/song-context/store";
import { TRUSS_Y, TRUSS_Z } from "./layout";

const BEAM_LENGTH = 7;
const BEAM_TOP = 0.06;
const BEAM_BOTTOM = 0.9;
/** Staubteilchen je Lichtkegel */
const DUST = 70;

/** Wert-Rauschen in 3D (für Dunst, der durch die Kegel zieht) */
const NOISE = /* glsl */ `
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise3(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
`;

/**
 * Volumetrischer Lichtkegel (Fake): additiver Kegel, zum Ende und zu den Rändern ausblendend. Der Dunst darin ist nicht
 * gleichmäßig: zwei Lagen Rauschen im Weltraum ziehen langsam durch (wie Hazer-Nebel), nahe der Lampe ist der Kern heller.
 */
const beamShader = {
  vertexShader: /* glsl */ `
    varying float vLen; varying vec3 vNormalV; varying vec3 vView; varying vec3 vWorld;
    void main() {
      vLen = uv.y;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vNormalV = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uIntensity, uTime, uHaze;
    varying float vLen; varying vec3 vNormalV; varying vec3 vView; varying vec3 vWorld;
    ${NOISE}
    void main() {
      float edge = pow(abs(dot(vNormalV, vView)), 1.6);
      float fall = pow(vLen, 1.8);
      vec3 q = vWorld * 0.9 + vec3(uTime * 0.12, uTime * 0.05, -uTime * 0.08);
      float haze = noise3(q) * 0.65 + noise3(q * 2.3 + 7.1) * 0.35;
      float density = mix(1.0, 0.35 + 1.1 * haze, uHaze);
      float core = 1.0 + 1.4 * pow(vLen, 8.0);
      gl_FragColor = vec4(uColor * edge * fall * density * core * uIntensity * 0.55, 1.0);
    }
  `,
};

/** Staub im Lichtkegel: Teilchen treiben langsam und funkeln, wenn sie das Licht treffen (im Raum der Lampe). */
const dustShader = {
  vertexShader: /* glsl */ `
    attribute vec4 aRand;
    uniform float uTime, uPx;
    varying float vTw;
    void main() {
      float y = -0.4 - aRand.x * ${(BEAM_LENGTH - 0.6).toFixed(1)};
      float r = mix(${BEAM_TOP.toFixed(2)}, ${BEAM_BOTTOM.toFixed(2)}, -y / ${BEAM_LENGTH.toFixed(1)}) * sqrt(aRand.y) * 0.9;
      float a = aRand.z * 6.2831 + uTime * (0.05 + 0.1 * aRand.w);
      vec3 p = vec3(cos(a) * r, y + sin(uTime * 0.3 + aRand.w * 20.0) * 0.15, sin(a) * r);
      vTw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.5 + aRand.w * 3.0) + aRand.z * 40.0), 4.0);
      // zum Ende des Kegels schwächer (wie der Kegel selbst)
      vTw *= pow(1.0 + y / ${BEAM_LENGTH.toFixed(1)}, 1.5);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = 0.022 * uPx / max(-mv.z, 0.3);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uIntensity;
    varying float vTw;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.5) * vTw * uIntensity * smoothstep(0.5, 0.0, d), 1.0);
    }
  `,
};

/** Lichtfleck auf dem Boden, wo der Kegel auftrifft (weicher Rand) */
const poolShader = {
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uIntensity, uFade; varying vec2 vUv;
    void main() {
      float d = length(vUv - 0.5) * 2.0;
      gl_FragColor = vec4(uColor * uIntensity * uFade * smoothstep(1.0, 0.25, d) * 0.45, 1.0);
    }
  `,
};

const ORIGIN = new Vector3();
const DIR = new Vector3();
const HIT = new Vector3();
/** Bühnenpodest (Radius) und Höhen der Böden: Podest oben, Publikum davor tiefer */
const STAGE_R = 4.25;

/**
 * Lichtfleck dorthin legen, wo die Kegelachse den Boden trifft (Podest oder Boden davor); als Ellipse, je flacher der
 * Strahl, desto länger. Gibt die Helligkeit zurück (weiter weg → schwächer).
 */
function placePool(m: Mesh, yoke: Group, on: boolean): number {
  yoke.updateWorldMatrix(true, false);
  ORIGIN.setFromMatrixPosition(yoke.matrixWorld);
  DIR.set(0, -1, 0).transformDirection(yoke.matrixWorld);
  m.visible = false;
  if (!on || DIR.y > -0.15 || !m.parent) return 0;
  let floor = 0.012;
  let d = (floor - ORIGIN.y) / DIR.y;
  HIT.copy(ORIGIN).addScaledVector(DIR, d);
  if (Math.hypot(HIT.x, HIT.z) > STAGE_R) {
    floor = -0.248;
    d = (floor - ORIGIN.y) / DIR.y;
    HIT.copy(ORIGIN).addScaledVector(DIR, d);
  }
  if (d > BEAM_LENGTH + 0.3) return 0;
  const r = BEAM_TOP + ((BEAM_BOTTOM - BEAM_TOP) * Math.max(d - 0.3, 0)) / BEAM_LENGTH;
  const stretch = Math.min(1 / -DIR.y, 3);
  m.parent.updateWorldMatrix(true, false);
  m.position.copy(m.parent.worldToLocal(HIT));
  m.rotation.set(-Math.PI / 2, 0, Math.atan2(-DIR.x, -DIR.z));
  m.scale.set(r, r * stretch, 1);
  m.visible = true;
  return 1 - (0.6 * d) / BEAM_LENGTH;
}

function dustGeometry(seed: number) {
  const g = new BufferGeometry();
  let s = seed * 7919 + 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.setAttribute("position", new BufferAttribute(new Float32Array(DUST * 3), 3));
  g.setAttribute("aRand", new BufferAttribute(Float32Array.from({ length: DUST * 4 }, rnd), 4));
  return g;
}

/** Moving Heads an der Traverse: Schwenk/Neigung/Farbe/Helligkeit aus dem LightDirector. */
export function MovingHeads({
  count,
  realLights,
  dust = true,
  lightsRef,
}: {
  count: number;
  realLights: number;
  /** Staub in den Kegeln (ab mittlerer Qualität) */
  dust?: boolean;
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
          dustOn={dust}
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
  dustOn,
  lightsRef,
}: {
  index: number;
  x: number;
  real: boolean;
  dustOn: boolean;
  lightsRef: React.RefObject<LightFrame | null>;
}) {
  const yoke = useRef<Group>(null);
  const beam = useRef<Mesh>(null);
  const light = useRef<SpotLight>(null);
  const target = useMemo(() => new Object3D(), []);
  const mat = useRef<ShaderMaterial>(null);
  // Kegel, Staub, Bodenfleck und Linse teilen Farbe/Helligkeit
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color() },
      uIntensity: { value: 0 },
      uTime: { value: 0 },
      uHaze: { value: 1 },
      uPx: { value: 500 },
      uFade: { value: 1 },
    }),
    [],
  );
  const dust = useMemo(() => dustGeometry(index + 1), [index]);
  const dustRef = useRef<Points>(null);
  const pool = useRef<Mesh>(null);
  const lens = useRef<Mesh>(null);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  useEffect(() => () => dust.dispose(), [dust]);

  useFrame(({ camera }) => {
    const h = lightsRef.current?.heads[index];
    if (!h || !yoke.current) return;
    yoke.current.rotation.set(h.tilt, h.pan, 0, "YXZ");
    const u = mat.current?.uniforms;
    if (u) {
      (u.uColor!.value as Color).set(h.color);
      u.uIntensity!.value = h.intensity;
      u.uTime!.value = songContext.getState().positionMs / 1000;
      u.uHaze!.value = 0.6 + 0.4 * (lightsRef.current?.fog ?? 0.6);
      const fov = "fov" in camera ? (camera.fov as number) : 36;
      u.uPx!.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan((fov * Math.PI) / 360));
    }
    const on = h.intensity > 0.01;
    if (beam.current) beam.current.visible = on;
    if (dustRef.current) dustRef.current.visible = on && dustOn;
    if (lens.current) {
      lens.current.visible = on;
      ((lens.current.material as MeshBasicMaterial).color as Color).set(h.color).multiplyScalar(0.4 + 1.6 * h.intensity);
    }
    if (pool.current && u) u.uFade!.value = placePool(pool.current, yoke.current, on);
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
      <mesh ref={pool} visible={false}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          args={[{ ...poolShader, uniforms }]}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
      <mesh>
        <boxGeometry args={[0.32, 0.18, 0.32]} />
        <meshStandardMaterial color="#15151b" metalness={0.7} roughness={0.4} />
      </mesh>
      <group ref={yoke}>
        <mesh position-y={-0.18}>
          <cylinderGeometry args={[0.12, 0.16, 0.26, 16]} />
          <meshStandardMaterial color="#1d1d24" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Linse: leuchtet in der Strahlfarbe (Bloom macht den Lichthof) */}
        <mesh ref={lens} position-y={-0.312} rotation-x={Math.PI / 2}>
          <circleGeometry args={[0.11, 20]} />
          <meshBasicMaterial toneMapped={false} side={DoubleSide} />
        </mesh>
        <points ref={dustRef} geometry={dust} frustumCulled={false}>
          <shaderMaterial
            args={[{ ...dustShader, uniforms }]}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false}
          />
        </points>
        <mesh ref={beam} position-y={-0.3 - BEAM_LENGTH / 2}>
          {/* Spitze oben (uv.y = 1 an der Basis des Zylinders → hell an der Lampe) */}
          <cylinderGeometry args={[BEAM_TOP, BEAM_BOTTOM, BEAM_LENGTH, 24, 1, true]} />
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

const BLINDER_X = [-3.6, -1.2, 1.2, 3.6];
const WARM = new Color("#ffb45a");

/** Lichthof um einen Blinder (zur Kamera gedreht) */
const flareShader = {
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uLevel; varying vec2 vUv;
    void main() {
      vec2 q = vUv - 0.5;
      float d = length(q) * 2.0;
      // runder Hof plus waagrechter Streifen (wie auf Konzertfotos)
      float glow = pow(max(1.0 - d, 0.0), 2.5) + 0.35 * pow(max(1.0 - abs(q.y) * 18.0, 0.0), 2.0) * max(1.0 - abs(q.x) * 2.0, 0.0);
      gl_FragColor = vec4(uColor * glow * uLevel, 1.0);
    }
  `,
};

/** Helligkeit der Blinder: Glühlampen (glimmen auch aus leicht) und Lichthof */
function setBlinderLevel(bulbs: MeshBasicMaterial, flare: { uLevel: { value: number } }, b: number) {
  bulbs.color.copy(WARM).multiplyScalar(0.08 + 2.2 * b);
  flare.uLevel.value = b * 1.4;
}

/**
 * Blinder: vier warme Fluter auf der Traverse, die beim Einsatz eines Höhepunkts ins Publikum (und in die Kamera)
 * aufblitzen, dazu ein warmes Licht von vorn auf die Tänzer.
 */
export function Blinders({ lightsRef }: { lightsRef: React.RefObject<LightFrame | null> }) {
  const flares = useRef<Array<Mesh | null>>([]);
  const front = useRef<PointLight>(null);
  const bulbs = useMemo(() => new MeshBasicMaterial({ color: WARM, toneMapped: false }), []);
  const uniforms = useMemo(() => ({ uColor: { value: WARM.clone() }, uLevel: { value: 0 } }), []);
  useEffect(() => () => bulbs.dispose(), [bulbs]);
  useFrame(({ camera }) => {
    const b = lightsRef.current?.blinders ?? 0;
    setBlinderLevel(bulbs, uniforms, b);
    for (const f of flares.current) {
      if (!f) continue;
      f.visible = b > 0.01;
      f.quaternion.copy(camera.quaternion);
    }
    if (front.current) front.current.intensity = b * 40;
  });
  return (
    <group position={[0, TRUSS_Y + 0.24, TRUSS_Z + 0.3]}>
      {BLINDER_X.map((x, i) => (
        <group key={x} position-x={x}>
          <mesh>
            <boxGeometry args={[0.5, 0.42, 0.14]} />
            <meshStandardMaterial color="#17171c" metalness={0.6} roughness={0.45} />
          </mesh>
          {[-0.11, 0.11].map((dx) =>
            [-0.09, 0.09].map((dy) => (
              <mesh key={`${dx}${dy}`} position={[dx, dy, 0.072]} material={bulbs}>
                <circleGeometry args={[0.085, 16]} />
              </mesh>
            )),
          )}
          <mesh ref={(m) => void (flares.current[i] = m)} position-z={0.12} visible={false}>
            <planeGeometry args={[2.4, 2.4]} />
            <shaderMaterial
              args={[{ ...flareShader, uniforms }]}
              transparent
              depthWrite={false}
              blending={AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
      <pointLight ref={front} position={[0, -1.2, 5.5]} color={WARM} intensity={0} distance={14} decay={1.5} />
    </group>
  );
}
