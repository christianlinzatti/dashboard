"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  FrontSide,
  type InstancedMesh,
  Matrix4,
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
import { Instances, mat } from "./instances";
import { NOT_ON_SCREENS, TRUSS_Y, TRUSS_Z } from "./layout";
import { useShaderArgs } from "./shader-args";

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
    uniform vec3 uColor; uniform float uIntensity, uTime, uHaze, uLean;
    varying float vLen; varying vec3 vNormalV; varying vec3 vView; varying vec3 vWorld;
    ${NOISE}
    void main() {
      float edge = pow(abs(dot(vNormalV, vView)), 1.6);
      float fall = pow(vLen, 1.8);
      float density = 1.0;
      // sparsam (schwache Grafik): ohne das Rauschen – das sind 16 Zufallswerte je Pixel
      if (uLean < 0.5) {
        vec3 q = vWorld * 0.9 + vec3(uTime * 0.12, uTime * 0.05, -uTime * 0.08);
        float haze = noise3(q) * 0.65 + noise3(q * 2.3 + 7.1) * 0.35;
        density = mix(1.0, 0.35 + 1.1 * haze, uHaze);
      }
      float core = 1.0 + 1.4 * pow(vLen, 8.0);
      // einseitig gezeichnet fehlt die Rückwand des Kegels: etwas heller, damit er gleich hell wirkt
      gl_FragColor = vec4(uColor * edge * fall * density * core * uIntensity * 0.55 * (1.0 + 0.7 * uLean), 1.0);
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

const HOUSING_OFFSET = new Matrix4().makeTranslation(0, -0.18, 0);
const LENS_OFFSET = mat({ p: [0, -0.312, 0], r: [Math.PI / 2, 0, 0] });

/** Moving Heads an der Traverse: Schwenk/Neigung/Farbe/Helligkeit aus dem LightDirector. */
export function MovingHeads({
  count,
  realLights,
  dust = true,
  lean = false,
  lightsRef,
}: {
  count: number;
  realLights: number;
  /** Staub in den Kegeln (ab mittlerer Qualität) */
  dust?: boolean;
  /** sparsam: Kegel einseitig und ohne Rauschen (schwache Grafik) */
  lean?: boolean;
  lightsRef: React.RefObject<LightFrame | null>;
}) {
  const xs = useMemo(
    () => Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * (9 / Math.max(count - 1, 1))),
    [count],
  );
  // Gehäuse aller Lampen: Sockel, Kopf und Linse (schwenken mit), Seile der Hängung – je ein Zeichenaufruf
  const bases = useMemo(() => xs.map((x) => mat({ p: [x, 0, 0] })), [xs]);
  const baseMesh = useRef<InstancedMesh>(null);
  const cables = useRef<InstancedMesh>(null);
  /** aktuelle Hängehöhe je Lampe (weich nachgeführt: hoch schnell, runter langsam) */
  const ys = useRef<number[]>([]);
  const stretch = useMemo(() => new Vector3(), []);
  const start = useMemo(() => xs.map(() => new Matrix4()), [xs]);
  const lensColors = useMemo(() => xs.map(() => new Color(0, 0, 0)), [xs]);
  const housings = useRef<InstancedMesh>(null);
  const lenses = useRef<InstancedMesh>(null);
  const yoke = useMemo(() => new Object3D(), []);
  const m = useMemo(() => new Matrix4(), []);
  const c = useMemo(() => new Color(), []);
  useFrame(() => {
    const heads = lightsRef.current?.heads;
    const hm = housings.current;
    const lm = lenses.current;
    if (!heads || !hm || !lm) return;
    const bm = baseMesh.current;
    const cm = cables.current;
    xs.forEach((x, i) => {
      const h = heads[i];
      if (!h) return;
      const prev = ys.current[i];
      const y = (ys.current[i] = prev === undefined ? h.y : prev + (h.y - prev) * (h.y > prev ? 0.16 : 0.045));
      bm?.setMatrixAt(i, m.makeTranslation(x, y, 0));
      // Seil von der Traverse bis zum Sockel (oben: nicht sichtbar)
      cm?.setMatrixAt(i, y < -0.02 ? m.makeTranslation(x, y / 2 + 0.09, 0).scale(stretch.set(1, -y, 1)) : m.makeScale(0, 0, 0));
      yoke.position.set(x, y, 0);
      yoke.rotation.set(h.tilt, h.pan, 0, "YXZ");
      yoke.updateMatrix();
      hm.setMatrixAt(i, m.multiplyMatrices(yoke.matrix, HOUSING_OFFSET));
      // Linse leuchtet in der Strahlfarbe (Bloom macht den Lichthof); aus = nicht sichtbar (Größe 0)
      const on = h.intensity > 0.01;
      lm.setMatrixAt(i, on ? m.multiplyMatrices(yoke.matrix, LENS_OFFSET) : m.makeScale(0, 0, 0));
      lm.setColorAt(i, c.set(h.color).multiplyScalar(0.4 + 1.6 * h.intensity));
    });
    hm.instanceMatrix.needsUpdate = true;
    lm.instanceMatrix.needsUpdate = true;
    for (const mesh of [bm, cm]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    if (lm.instanceColor) lm.instanceColor.needsUpdate = true;
    hm.computeBoundingSphere();
    lm.computeBoundingSphere();
  });
  return (
    <group position={[0, TRUSS_Y - 0.2, TRUSS_Z + 0.25]}>
      <Instances matrices={bases} meshRef={baseMesh}>
        <boxGeometry args={[0.32, 0.18, 0.32]} />
        <meshStandardMaterial color="#15151b" metalness={0.7} roughness={0.4} />
      </Instances>
      <Instances matrices={start} meshRef={cables}>
        <cylinderGeometry args={[0.012, 0.012, 1, 4]} />
        <meshStandardMaterial color="#2a2a30" metalness={0.8} roughness={0.4} />
      </Instances>
      <Instances matrices={start} meshRef={housings}>
        <cylinderGeometry args={[0.12, 0.16, 0.26, 16]} />
        <meshStandardMaterial color="#1d1d24" metalness={0.6} roughness={0.4} />
      </Instances>
      <Instances matrices={start} colors={lensColors} meshRef={lenses}>
        <circleGeometry args={[0.11, 20]} />
        <meshBasicMaterial toneMapped={false} side={DoubleSide} />
      </Instances>
      {xs.map((x, i) => (
        <Head
          key={i}
          index={i}
          x={x}
          real={i >= (count - realLights) / 2 && i < (count + realLights) / 2}
          dustOn={dust}
          lean={lean}
          lightsRef={lightsRef}
          ysRef={ys}
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
  lean,
  lightsRef,
  ysRef,
}: {
  index: number;
  x: number;
  real: boolean;
  dustOn: boolean;
  lean: boolean;
  lightsRef: React.RefObject<LightFrame | null>;
  /** Hängehöhe je Lampe (MovingHeads) */
  ysRef: React.RefObject<number[]>;
}) {
  const yoke = useRef<Group>(null);
  const hang = useRef<Group>(null);
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
      uLean: { value: 0 },
    }),
    [],
  );
  const dust = useMemo(() => dustGeometry(index + 1), [index]);
  const dustRef = useRef<Points>(null);
  const pool = useRef<Mesh>(null);
  // Staub und Lichtfleck am Boden: zu fein für die Live-Bildschirme – dort nicht mitgefilmt
  useLayoutEffect(() => {
    dustRef.current?.layers.set(NOT_ON_SCREENS);
    pool.current?.layers.set(NOT_ON_SCREENS);
  }, []);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  useEffect(() => () => dust.dispose(), [dust]);

  useFrame(({ camera }) => {
    const h = lightsRef.current?.heads[index];
    if (!h || !yoke.current) return;
    if (hang.current) hang.current.position.y = ysRef.current[index] ?? h.y;
    yoke.current.rotation.set(h.tilt, h.pan, 0, "YXZ");
    const u = mat.current?.uniforms;
    if (u) {
      u.uLean!.value = lean ? 1 : 0;
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

  const shaderArgs1 = useShaderArgs({ ...poolShader, uniforms });
  const shaderArgs2 = useShaderArgs({ ...dustShader, uniforms });
  const shaderArgs3 = useShaderArgs({ ...beamShader, uniforms });
  return (
    <group position-x={x} ref={hang}>
      <mesh ref={pool} visible={false}>
        <planeGeometry args={[2, 2]} />
        <shaderMaterial
          args={shaderArgs1}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
      {/* Sockel, Gehäuse und Linse: gemeinsam für alle Lampen in MovingHeads */}
      <group ref={yoke}>
        {/* Staub: zu fein für die Live-Bildschirme – dort nicht mitgefilmt */}
        <points ref={dustRef} geometry={dust} frustumCulled={false}>
          <shaderMaterial args={shaderArgs2} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </points>
        <mesh ref={beam} position-y={-0.3 - BEAM_LENGTH / 2}>
          {/* Spitze oben (uv.y = 1 an der Basis des Zylinders → hell an der Lampe) */}
          <cylinderGeometry args={[BEAM_TOP, BEAM_BOTTOM, BEAM_LENGTH, 24, 1, true]} />
          <shaderMaterial
            ref={mat}
            args={shaderArgs3}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            side={lean ? FrontSide : DoubleSide}
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
  const beams = useRef<InstancedMesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const pivot = useMemo(() => new Object3D(), []);
  const m = useMemo(() => new Matrix4(), []);
  // Drehpunkt an der Traverse, Strahl nach unten/vorn: Strahlmitte 7 m unter dem Drehpunkt
  const down = useMemo(() => new Matrix4().makeTranslation(0, -7, 0), []);
  const start = useMemo(() => Array.from({ length: count }, () => new Matrix4()), [count]);
  useFrame(() => {
    const l = lightsRef.current?.lasers;
    if (!l || !group.current) return;
    group.current.visible = l.on;
    if (!l.on) return;
    group.current.rotation.z = l.rotation;
    const b = beams.current;
    if (b) {
      for (let i = 0; i < count; i++) {
        pivot.rotation.set(-0.35, 0, ((i / Math.max(count - 1, 1)) * 2 - 1) * l.spread);
        pivot.updateMatrix();
        b.setMatrixAt(i, m.multiplyMatrices(pivot.matrix, down));
      }
      b.instanceMatrix.needsUpdate = true;
      b.computeBoundingSphere();
    }
    // alle Strahlen in derselben Farbe: ein Material, ein Zeichenaufruf
    material.current?.color.set(l.color);
    if (material.current) material.current.opacity = l.intensity * 0.8;
  });
  return (
    <group ref={group} position={[0, TRUSS_Y - 0.1, TRUSS_Z]}>
      <Instances matrices={start} meshRef={beams}>
        <boxGeometry args={[0.025, 14, 0.025]} />
        <meshBasicMaterial ref={material} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </Instances>
    </group>
  );
}

const BLINDER_X = [-3.6, -1.2, 1.2, 3.6];
const BLINDER_BOXES = BLINDER_X.map((x) => mat({ p: [x, 0, 0] }));
/** vier Glühlampen je Blinder */
const BLINDER_BULBS = BLINDER_X.flatMap((x) =>
  [-0.11, 0.11].flatMap((dx) => [-0.09, 0.09].map((dy) => mat({ p: [x + dx, dy, 0.072] }))),
);
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
  const shaderArgs4 = useShaderArgs({ ...flareShader, uniforms });
  return (
    <group position={[0, TRUSS_Y + 0.24, TRUSS_Z + 0.3]}>
      {/* Gehäuse und Glühlampen aller Blinder: je ein Zeichenaufruf */}
      <Instances matrices={BLINDER_BOXES}>
        <boxGeometry args={[0.5, 0.42, 0.14]} />
        <meshStandardMaterial color="#17171c" metalness={0.6} roughness={0.45} />
      </Instances>
      <Instances matrices={BLINDER_BULBS}>
        <circleGeometry args={[0.085, 16]} />
        <primitive object={bulbs} attach="material" />
      </Instances>
      {BLINDER_X.map((x, i) => (
        <group key={x} position-x={x}>
          <mesh ref={(m) => void (flares.current[i] = m)} position-z={0.12} visible={false}>
            <planeGeometry args={[2.4, 2.4]} />
            <shaderMaterial args={shaderArgs4} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <pointLight ref={front} position={[0, -1.2, 5.5]} color={WARM} intensity={0} distance={14} decay={1.5} />
    </group>
  );
}
