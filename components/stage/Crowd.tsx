"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Vector3,
  type Mesh,
  type Points,
  type ShaderMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Choreography } from "@/lib/dance/plan";
import { rng } from "@/lib/dance/rng";
import { crowdAt, crowdSpots } from "@/lib/stage/crowd";
import type { LightFrame } from "@/lib/stage/lights";
import type { Theme } from "@/lib/stage/themes";
import type { Frame } from "./types";

const MAX = 520;
/** Die Menge steht tiefer als die Bühne (Bühnenkante ≈ 1 m hoch): Köpfe knapp unter Podesthöhe, Hände darüber */
const BASE_Y = -1.1;

/** Gemeinsame Bewegungslogik für Silhouetten und Lichter (gleiche Person → gleiche Armhaltung). */
const MOTION = /* glsl */ `
  uniform float uBeats, uTime, uHands, uJump, uPhones, uSway, uBaseY, uMosh, uClap;
  uniform vec3 uCam;
  const float PI = 3.14159265;
  const float ARM = 0.58;
  const vec2 SHOULDER = vec2(0.26, 1.38);

  float handsUp(vec4 r) { return step(r.x, uHands); }
  float hasPhone(vec4 r) { return step(r.y, uPhones); }
  /** Klatscher sind andere Leute als die mit erhobenen Händen (vom anderen Ende der Zufallswerte) */
  float clapper(vec4 r) { return step(1.0 - uClap, r.x) * (1.0 - handsUp(r)); }
  /** Armwinkel: 0 = hängt, ~2,75 = gestreckt nach oben (leicht nach vorn) */
  float armAngle(vec4 r, float side) {
    float pump = 2.6 + 0.32 * sin(uBeats * 2.0 * PI + r.z * 1.7);
    float up = handsUp(r) * pump;
    up = mix(up, 2.45, clapper(r));
    if (side > 0.0) up = mix(up, 2.78 + 0.06 * sin(uTime * 1.3 + r.z * 6.0), hasPhone(r));
    return max(up, 0.12);
  }
  /** Klatschen: beide Arme schwingen zur Mitte, die Hände treffen sich auf jedem Schlag */
  float armRoll(vec4 r, float side) {
    float hit = pow(1.0 - abs(sin(PI * uBeats)), 3.0);
    return side * clapper(r) * (1.0 - hasPhone(r)) * (0.12 + 0.5 * hit);
  }
  /** Armpunkt (Grundhaltung: hängend) an die aktuelle Armhaltung: erst heben (um x), dann zur Mitte schwingen (um z) */
  vec3 armXform(vec3 p, float side, vec4 r) {
    float a = -armAngle(r, side);
    vec3 pivot = vec3(side * SHOULDER.x, SHOULDER.y, 0.0);
    vec3 q = p - pivot;
    q = vec3(q.x, q.y * cos(a) - q.z * sin(a), q.y * sin(a) + q.z * cos(a));
    float th = armRoll(r, side);
    q = vec3(q.x * cos(th) - q.y * sin(th), q.x * sin(th) + q.y * cos(th), q.z);
    return pivot + q;
  }
  /** Moshpit: nur vor der Bühnenmitte (vorne, nicht zu weit seitlich) */
  float pit(vec3 spot) {
    return uMosh * smoothstep(9.5, 6.5, length(spot.xy)) * smoothstep(3.6, 1.8, abs(spot.x));
  }
  float hop(vec4 r) {
    return uJump * step(r.w, 0.25 + 0.75 * uJump) * abs(sin(PI * (uBeats + r.z * 0.12))) * 0.2;
  }
  float swayX(vec4 r, vec3 spot, float y) {
    return sin(uTime * 1.25 + r.z * 2.0 + spot.x * 0.3) * 0.07 * uSway * max(y - 0.8, 0.0);
  }
  /** Personen-Koordinaten → Welt: zur Bühnenmitte gedreht, in den Graben gestellt, nahe an der Kamera eingezogen */
  vec3 toWorld(vec3 p, vec3 spot, vec4 r) {
    vec2 f = normalize(-spot.xy);
    float near = smoothstep(1.2, 2.1, distance(spot.xy, uCam.xz));
    p.x += swayX(r, spot, p.y);
    p *= spot.z * near;
    // Moshpit: Leute rempeln sich (seitlich und vor/zurück), höher und wilder springen
    float m = pit(spot);
    vec2 shove = m * vec2(sin(uTime * 5.3 + r.z * 23.0) * 0.32, cos(uTime * 4.1 + r.x * 17.0) * 0.22);
    float extra = m * abs(sin(PI * (uBeats * 1.5 + r.w * 3.0))) * 0.22;
    return vec3(
      spot.x + shove.x + p.x * f.y + p.z * f.x,
      uBaseY + p.y + (hop(r) + extra) * near,
      spot.y + shove.y - p.x * f.x + p.z * f.y
    );
  }
`;

function personGeometry() {
  const part = (g: BufferGeometry, id: number) => {
    const flat = g.index ? g.toNonIndexed() : g;
    flat.deleteAttribute("uv");
    flat.setAttribute("aPart", new BufferAttribute(new Float32Array(flat.getAttribute("position").count).fill(id), 1));
    return flat;
  };
  const arm = (side: number) => new CylinderGeometry(0.04, 0.032, 0.58, 5).translate(side * 0.26, 1.38 - 0.29, 0);
  return mergeGeometries([
    // Rumpf als flacher Sechskant (rundere Silhouette als ein Quader)
    part(new CylinderGeometry(0.2, 0.16, 0.62, 6).scale(1, 1, 0.6).translate(0, 1.13, 0), 0),
    part(new IcosahedronGeometry(0.115, 1).translate(0, 1.57, 0), 0),
    part(arm(-1), 1),
    part(arm(1), 2),
  ]);
}

/**
 * Publikum vor der Bühne: Silhouetten (ein Draw-Call, Bewegung im Vertex-Shader) mit Handylichtern und
 * LED-Armbändern. Was die Menge tut, bestimmt die Publikums-Regie (lib/stage/crowd.ts) – zustandslos aus der Songzeit.
 */
export function Crowd({
  count,
  choreo,
  theme,
  dark,
  accent,
  frameRef,
  lightsRef,
}: {
  count: number;
  choreo: Choreography;
  theme: Theme;
  dark: string;
  accent: string;
  frameRef: React.RefObject<Frame>;
  lightsRef: React.RefObject<LightFrame | null>;
}) {
  const n = Math.min(count, MAX);
  const size = useThree((s) => s.size);
  const people = useRef<ShaderMaterial>(null);
  const lights = useRef<ShaderMaterial>(null);

  const { bodies, points } = useMemo(() => {
    const spots = crowdSpots(MAX, rng("publikum").next);
    const spot = new Float32Array(MAX * 3);
    const rand = new Float32Array(MAX * 4);
    for (let i = 0; i < MAX; i++) {
      spot.set(spots.subarray(i * 7, i * 7 + 3), i * 3);
      rand.set(spots.subarray(i * 7 + 3, i * 7 + 7), i * 4);
    }
    const base = personGeometry();
    const bodies = new InstancedBufferGeometry();
    bodies.setAttribute("position", base.getAttribute("position"));
    bodies.setAttribute("normal", base.getAttribute("normal"));
    bodies.setAttribute("aPart", base.getAttribute("aPart"));
    bodies.setAttribute("aSpot", new InstancedBufferAttribute(spot, 3));
    bodies.setAttribute("aRand", new InstancedBufferAttribute(rand, 4));

    // zwei Lichtpunkte je Person: Handy (rechte Hand) und Armband (linkes Handgelenk)
    const points = new BufferGeometry();
    const dup = (src: Float32Array, w: number) => {
      const out = new Float32Array(MAX * 2 * w);
      for (let i = 0; i < MAX; i++) for (let k = 0; k < 2; k++) out.set(src.subarray(i * w, i * w + w), (i * 2 + k) * w);
      return out;
    };
    points.setAttribute("position", new BufferAttribute(new Float32Array(MAX * 2 * 3), 3));
    points.setAttribute("aSpot", new BufferAttribute(dup(spot, 3), 3));
    points.setAttribute("aRand", new BufferAttribute(dup(rand, 4), 4));
    points.setAttribute(
      "aKind",
      new BufferAttribute(
        Float32Array.from({ length: MAX * 2 }, (_, i) => i % 2),
        1,
      ),
    );
    return { bodies, points };
  }, []);
  // Anzahl je Qualitätsstufe/Bühne: die Plätze sind zufällig sortiert → jeder Anfangsteil ist gleichmäßig verteilt
  const bodyMesh = useRef<Mesh>(null);
  const lightPoints = useRef<Points>(null);
  useEffect(() => {
    if (bodyMesh.current) (bodyMesh.current.geometry as InstancedBufferGeometry).instanceCount = n;
    lightPoints.current?.geometry.setDrawRange(0, n * 2);
  }, [bodies, points, n]);
  useEffect(
    () => () => {
      bodies.dispose();
      points.dispose();
    },
    [bodies, points],
  );

  const shared = useMemo(
    () => ({
      uBeats: { value: 0 },
      uTime: { value: 0 },
      uHands: { value: 0 },
      uJump: { value: 0 },
      uPhones: { value: 0 },
      uSway: { value: 0 },
      uMosh: { value: 0 },
      uClap: { value: 0 },
      uBaseY: { value: BASE_Y },
      uCam: { value: new Vector3() },
      uFogColor: { value: new Color(dark) },
      uFogFar: { value: theme.fogFar },
    }),
    [dark, theme.fogFar],
  );
  const peopleUniforms = useMemo(
    () => ({
      ...shared,
      uColor: { value: new Color(dark).lerp(new Color(accent), 0.1) },
      uGlow: { value: new Color(accent) },
      uEnergy: { value: 0.5 },
      uBlind: { value: 0 },
      uCapColor: { value: new Color(accent) },
    }),
    [shared, dark, accent],
  );
  const lightUniforms = useMemo(
    () => ({
      ...shared,
      uBands: { value: 0 },
      uBandMode: { value: 0 },
      uA: { value: new Color(accent) },
      uB: { value: new Color(accent) },
      uPhoneColor: { value: new Color(theme.id === "jazz" ? "#ffcf8a" : "#f2f6ff") },
      uLighter: { value: 0 },
      uPx: { value: 500 },
    }),
    [shared, accent, theme.id],
  );

  useFrame(({ camera, gl }) => {
    const f = frameRef.current;
    const c = f.playing
      ? crowdAt(choreo, f.t, { dropMs: f.dropMs })
      : { hands: 0, jump: 0, phones: 0, bands: 0.1, bandMode: 0, sway: 0.3, mosh: 0, lighter: 0, clap: 0 };
    // gemeinsame Uniforms (beide Materialien teilen dieselben Objekte) über das Material setzen
    const u = people.current?.uniforms;
    if (!u) return;
    u.uBeats!.value = (f.t - (f.anchorMs ?? 0)) / choreo.beatMs;
    u.uTime!.value = f.t / 1000;
    u.uHands!.value = c.hands;
    u.uJump!.value = c.jump;
    u.uPhones!.value = c.phones;
    u.uSway!.value = c.sway;
    u.uMosh!.value = c.mosh;
    u.uClap!.value = c.clap;
    u.uBlind!.value = lightsRef.current?.blinders ?? 0;
    (u.uCam!.value as Vector3).copy(camera.position);
    u.uEnergy!.value = f.energy;
    const l = lights.current?.uniforms;
    const lf = lightsRef.current;
    if (l) {
      l.uBands!.value = c.bands;
      l.uBandMode!.value = c.bandMode;
      l.uLighter!.value = c.lighter;
      if (lf) {
        (l.uA!.value as Color).set(lf.wall.colorB);
        (l.uB!.value as Color).set(lf.signal.base);
      }
      const fov = "fov" in camera ? (camera.fov as number) : 36;
      l.uPx!.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan((fov * Math.PI) / 360));
    }
    // für Tests und Debug: was das Publikum gerade tut
    const label =
      c.mosh > 0.5
        ? "moshpit"
        : c.phones > 0.5
          ? c.lighter > 0.5
            ? "feuerzeuge"
            : "handys"
          : c.jump > 0.5
            ? "springen"
            : c.clap > 0.4
              ? "klatschen"
              : c.hands > 0.5
                ? "haende"
                : "ruhig";
    if (gl.domElement.dataset.crowd !== label) gl.domElement.dataset.crowd = label;
  });

  return (
    <group>
      {/* Graben: dunkelt den Boden unter der Menge ab (sie steht tiefer als die Bühne) */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.252}>
        <ringGeometry args={[4.75, 16, 48, 1, (Math.PI * 5) / 6 - 0.2, (Math.PI * 4) / 3 + 0.4]} />
        <meshBasicMaterial color={dark} transparent opacity={0.86} depthWrite={false} />
      </mesh>
      <mesh ref={bodyMesh} geometry={bodies} frustumCulled={false}>
        <shaderMaterial
          ref={people}
          args={[
            {
              uniforms: peopleUniforms,
              vertexShader: /* glsl */ `
                attribute vec3 aSpot; attribute vec4 aRand; attribute float aPart;
                ${MOTION}
                varying vec3 vN; varying vec3 vW; varying vec3 vAlbedo;
                float hv(float x) { return fract(sin(x) * 43758.5453); }
                vec3 pick8(float k, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e, vec3 f, vec3 g, vec3 i) {
                  return k < 0.125 ? a : k < 0.25 ? b : k < 0.375 ? c : k < 0.5 ? d : k < 0.625 ? e : k < 0.75 ? f : k < 0.875 ? g : i;
                }
                uniform vec3 uCapColor;
                void main() {
                  vec3 p = position; vec3 nrm = normal;
                  // Kleidung, Haut, Haare je Person (gedeckte Farben – im Dunkeln wirken sie erst im Licht).
                  // Im Vertex-Shader gerechnet: dort ist die Genauigkeit hoch genug (sonst rauscht die Farbe pro Pixel).
                  float k1 = hv(aRand.z * 91.7 + aRand.w * 13.1); float k2 = hv(aRand.w * 57.3 + aRand.x * 7.7);
                  vec3 shirt = pick8(k1, vec3(0.08), vec3(0.14, 0.2, 0.32), vec3(0.36, 0.1, 0.12), vec3(0.22, 0.27, 0.16),
                    vec3(0.55), vec3(0.2, 0.15, 0.3), vec3(0.38, 0.27, 0.17), vec3(0.1, 0.3, 0.34));
                  vec3 skin = mix(vec3(0.62, 0.45, 0.35), vec3(0.24, 0.15, 0.1), k2);
                  vec3 hair = k2 < 0.3 ? vec3(0.45, 0.34, 0.2) : k2 < 0.6 ? vec3(0.16, 0.1, 0.06) : vec3(0.04);
                  bool cap = hv(aRand.x * 31.3) > 0.86;
                  vAlbedo = shirt;
                  if (aPart < 0.5 && position.y > 1.45) {
                    // Kopf: Gesicht zur Bühne, sonst Haare (oder Kappe)
                    bool face = normal.z > 0.35 && normal.y < 0.55;
                    vAlbedo = face ? skin : cap ? mix(uCapColor, vec3(0.8), step(0.5, k1)) * 0.6 : hair;
                  } else if (aPart > 0.5 && position.y < 1.12) {
                    vAlbedo = skin; // Unterarme und Hände
                  }
                  if (aPart > 0.5) p = armXform(p, aPart < 1.5 ? -1.0 : 1.0, aRand);
                  vec2 f = normalize(-aSpot.xy);
                  vN = vec3(nrm.x * f.y + nrm.z * f.x, nrm.y, -nrm.x * f.x + nrm.z * f.y);
                  vW = toWorld(p, aSpot, aRand);
                  gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
                }
              `,
              fragmentShader: /* glsl */ `
                uniform vec3 uColor, uGlow, uFogColor, uCam; uniform float uEnergy, uFogFar, uBlind;
                varying vec3 vN; varying vec3 vW; varying vec3 vAlbedo;
                void main() {
                  vec3 n = normalize(vN);
                  vec3 albedo = mix(uColor, vAlbedo, 0.7);
                  // Bühnenlicht trifft die Vorderseite der vorderen Reihen; die Kamera sieht meist die Rücken → Silhouette mit Lichtkante
                  float front = smoothstep(12.0, 5.0, length(vW.xz));
                  float lit = max(dot(n, normalize(vec3(-vW.x, 1.2, -vW.z))), 0.0);
                  float rim = pow(1.0 - abs(dot(n, normalize(uCam - vW))), 2.5);
                  // Streiflicht von oben auf Köpfe und Schultern – sonst verschwinden die Rücken im dunklen Graben
                  float top = pow(max(n.y, 0.0), 1.5);
                  vec3 col = albedo * (0.18 + lit * front * 0.5 * (0.4 + uEnergy) + top * 0.45 * (0.5 + uEnergy))
                    + uGlow * (rim * 0.1 + top * 0.12 * (0.5 + uEnergy))
                    // Blinder strahlen warm über die Menge
                    + vec3(1.0, 0.7, 0.4) * uBlind * (0.35 * lit * front + 0.25 * top) * (0.4 + albedo);
                  float fog = smoothstep(9.0, uFogFar, distance(uCam, vW));
                  gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
                }
              `,
            },
          ]}
        />
      </mesh>
      <points ref={lightPoints} geometry={points} frustumCulled={false}>
        <shaderMaterial
          ref={lights}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
          args={[
            {
              uniforms: lightUniforms,
              vertexShader: /* glsl */ `
                attribute vec3 aSpot; attribute vec4 aRand; attribute float aKind;
                ${MOTION}
                uniform float uBands, uBandMode, uPx, uFogFar, uLighter;
                uniform vec3 uA, uB, uPhoneColor;
                varying vec3 vColor;
                float h(float x) { return fract(sin(x) * 43758.5453); }
                void main() {
                  float side = aKind < 0.5 ? 1.0 : -1.0;
                  // Handy an der Hand, Armband am Handgelenk
                  float len = aKind < 0.5 ? ARM + 0.06 : ARM * 0.86;
                  vec3 p = armXform(vec3(side * SHOULDER.x, SHOULDER.y - len, 0.0), side, aRand);
                  vec3 w = toWorld(p, aSpot, aRand);
                  float level; vec3 col; float size;
                  if (aKind < 0.5) {
                    // Feuerzeug: warm, flackernd, etwas größer; sonst Handy-Display
                    float flicker = 0.7 + 0.3 * sin(uTime * 11.0 + aRand.x * 50.0) * sin(uTime * 7.3 + aRand.z * 30.0);
                    level = hasPhone(aRand) * mix(0.75 + 0.25 * sin(uTime * 2.0 + aRand.x * 40.0), flicker, uLighter);
                    col = mix(uPhoneColor, vec3(1.0, 0.62, 0.22), uLighter); size = mix(0.075, 0.095, uLighter);
                  } else {
                    float sparkle = step(0.62, h(floor(uBeats * 2.0) * 1.37 + aRand.x * 37.0));
                    float pulse = 0.3 + 0.7 * pow(1.0 - fract(uBeats), 2.0);
                    float wave = 0.15 + 0.85 * pow(0.5 + 0.5 * sin(aSpot.x * 0.9 - uBeats * PI * 0.5), 3.0);
                    level = uBands * (uBandMode < 0.5 ? sparkle : uBandMode < 1.5 ? pulse : wave);
                    col = aRand.w < 0.5 ? uA : uB; size = 0.06;
                  }
                  float near = smoothstep(1.2, 2.1, distance(aSpot.xy, uCam.xz));
                  float fog = 1.0 - 0.7 * smoothstep(9.0, uFogFar, distance(uCam, w));
                  vColor = col * level * near * fog;
                  vec4 mv = viewMatrix * vec4(w, 1.0);
                  mv.z += 0.09; // ein Stück zur Kamera: das Licht sitzt außen am Arm, nicht im Arm
                  gl_Position = projectionMatrix * mv;
                  gl_PointSize = step(0.02, level) * size * uPx / max(-mv.z, 0.1);
                }
              `,
              fragmentShader: /* glsl */ `
                varying vec3 vColor;
                void main() {
                  float d = length(gl_PointCoord - 0.5);
                  gl_FragColor = vec4(vColor * smoothstep(0.5, 0.05, d), 1.0);
                }
              `,
            },
          ]}
        />
      </points>
    </group>
  );
}

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
      {FLAG_SPOTS.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]} rotation-y={(i % 2 ? 1 : -1) * 0.5}>
          <mesh position-y={1.1}>
            <cylinderGeometry args={[0.015, 0.015, 2.6, 6]} />
            <meshStandardMaterial color="#888" metalness={0.6} roughness={0.4} />
          </mesh>
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
