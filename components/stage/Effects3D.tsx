"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  DoubleSide,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  Quaternion,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type BufferGeometry,
  type Mesh,
  type ShaderMaterial,
} from "three";
import { rng } from "@/lib/dance/rng";
import type { Palette } from "@/lib/song-context/schema";
import type { ActiveCue } from "@/lib/stage/effects";
import type { LightFrame } from "@/lib/stage/lights";
import type { Theme } from "@/lib/stage/themes";
import { TRUSS_Y, TRUSS_Z } from "./StageSet";

/**
 * Schaum und Konfetti als echte 3D-Körper statt Bildpunkten: instanzierte Kugeln bzw. Papierschnipsel, im Vertex-Shader
 * aus (Alter des Einsatzes, Zufallswerten) bewegt – zustandslos wie die übrigen Effekte (gleiche Songzeit, gleiches Bild).
 * Beide werden vom Grundlicht der Szene und der Bühnenfarbe beleuchtet und liegen am Ende auf dem Boden.
 */

type V3 = [number, number, number];

/** Schaumkanonen: Düse und Schussrichtung (Länge = Reichweite relativ). Vorn auf Stativen ins Publikum, hinten an der Traverse über die Tänzer. */
export const FOAM_CANNONS: Array<{ nozzle: V3; aim: V3; stand: boolean }> = [
  { nozzle: [-3.4, 1.35, 2.4], aim: [-0.25, 0.45, 1], stand: true },
  { nozzle: [3.4, 1.35, 2.4], aim: [0.25, 0.45, 1], stand: true },
  { nozzle: [-1.7, TRUSS_Y - 0.32, TRUSS_Z + 0.55], aim: [0.1, -0.05, 0.8], stand: false },
  { nozzle: [1.7, TRUSS_Y - 0.32, TRUSS_Z + 0.55], aim: [-0.1, -0.05, 0.8], stand: false },
];

const CONFETTI_ORIGINS: V3[] = [
  [-3.0, 0.3, 1.0],
  [3.0, 0.3, 1.0],
  [0, 4.1, -2.4],
];

/** Lebensdauer eines Schnipsels/einer Flocke in s (Flug + Liegen); passt zu LINGER_MS in lib/stage/effects.ts */
export const CONFETTI_LIFE = 16;
export const FOAM_LIFE = 9;

const COMMON = /* glsl */ `
  attribute vec4 aRand;
  uniform float uAge, uDur, uSpawn, uLife, uSeed;
  varying vec3 vN; varying vec3 vW;
  float h(float n) { return fract(sin(n) * 43758.5453); }
  /* Boden: Bühnenpodest (Radius 4,3) auf 0, davor das Publikum tiefer */
  float floorAt(vec2 xz) { return length(xz) < 4.3 ? 0.0 : -0.25; }
  /* Rodrigues-Drehung */
  vec3 rot(vec3 v, vec3 a, float ang) { float c = cos(ang), s = sin(ang); return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c); }
`;

const LIGHT = /* glsl */ `
  uniform vec3 uSky, uGround, uWash; uniform float uLight;
  vec3 hemi(vec3 n) { return mix(uGround, uSky, n.y * 0.5 + 0.5); }
  const vec3 KEY = vec3(0.4243, 0.7071, 0.5657); // Richtung des Grundlichts (3, 5, 4)
`;

const foamVertex = /* glsl */ `
  ${COMMON}
  uniform float uSpeed, uSpread, uDrag, uSize;
  uniform vec3 uO0, uO1, uO2, uO3, uD0, uD1, uD2, uD3;
  #include <fog_pars_vertex>
  void main() {
    // Klumpen: gemeinsamer Start und Richtung, die Kugeln eines Klumpens liegen dicht beieinander
    float cl = floor(aRand.x * 220.0);
    float c1 = h(cl * 1.13 + uSeed); float c2 = h(cl * 2.71 + uSeed); float c3 = h(cl * 4.37 + uSeed);
    float e = floor(h(cl * 5.9 + uSeed) * 4.0);
    vec3 origin = e < 0.5 ? uO0 : e < 1.5 ? uO1 : e < 2.5 ? uO2 : uO3;
    vec3 aim = e < 0.5 ? uD0 : e < 1.5 ? uD1 : e < 2.5 ? uD2 : uD3;
    float phase = c1 * uSpawn;
    float n = floor(max(uAge - phase, 0.0) / uLife);
    float tb = phase + n * uLife;
    float age = uAge - tb;
    float alive = step(phase, uAge) * step(tb, uDur);

    vec3 fwd = normalize(aim);
    vec3 side = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(side, fwd);
    float th = c2 * 6.2831; float rad = uSpread * sqrt(c3);
    vec3 dir = (fwd + (side * cos(th) + up * sin(th) * 0.6) * rad) * length(aim) * (0.75 + 0.25 * h(cl * 9.1 + uSeed));
    vec3 p = origin + dir * uSpeed * (1.0 - exp(-uDrag * age)) / uDrag;
    vec3 off = (aRand.yzw - 0.5) * (0.12 + 0.3 * min(age, 1.5));
    p += off;
    p.y -= 1.1 * age;
    p.x += sin(age * 1.3 + c2 * 6.28) * 0.15;
    // liegt als Teppich: auf der Bühne flacher, im Publikum bis zur Hüfte
    float heap = floorAt(p.xz) + 0.06 + 0.35 * h(cl * 3.3 + uSeed) + off.y * 0.6;
    float landed = step(p.y, heap);
    p.y = max(p.y, heap);

    float l01 = clamp(age / uLife, 0.0, 1.0);
    float r = uSize * (0.55 + 0.9 * aRand.y) * (1.0 + 0.6 * min(age, 2.0) / 2.0);
    r *= smoothstep(0.0, 0.25, age) * (1.0 - smoothstep(0.72, 1.0, l01)) * alive;
    // Kugeln nah an der Kamera: kleiner und weg, damit kein Schaum die Linse zudeckt
    float dist = length(cameraPosition - p);
    r = min(r, 0.045 * dist) * smoothstep(1.6, 2.8, dist);

    // unregelmäßige Oberfläche (gleiche Ecke → gleicher Wert, also keine Risse)
    vec3 nrm = normalize(position);
    float lump = 1.0 + 0.1 * (h(dot(nrm, vec3(12.9, 78.2, 37.7)) + aRand.z * 17.0) - 0.5);
    vec3 local = position * r * lump;
    local.y *= mix(1.0, 0.7, landed);
    vec3 wp = p + local;
    vN = nrm; vW = wp;
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const foamFragment = /* glsl */ `
  varying vec3 vN; varying vec3 vW;
  ${LIGHT}
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    // Schaum streut Licht: weiches Umgreifen statt harter Schattenkante, heller Rand im Gegenlicht
    float wrap = max((dot(n, KEY) + 0.55) / 1.55, 0.0);
    float rim = pow(1.0 - max(dot(n, v), 0.0), 2.0);
    // nasse Bläschen: kleiner Glanzpunkt
    float spec = pow(max(dot(n, normalize(KEY + v)), 0.0), 28.0) * 0.3;
    vec3 c = vec3(0.93, 0.95, 0.98) * (0.42 * hemi(n) + 0.58 * wrap) + uWash * (0.18 + 0.4 * rim) + spec;
    gl_FragColor = vec4(c * uLight, 1.0);
    #include <fog_fragment>
  }
`;

const confettiVertex = /* glsl */ `
  ${COMMON}
  uniform float uSpeed, uSpread, uDrag, uSize, uOriginCount;
  uniform vec3 uO0, uO1, uO2;
  varying float vPick; varying float vFoil;
  #include <fog_pars_vertex>
  void main() {
    vec4 r = fract(aRand + uSeed * vec4(0.1371, 0.2719, 0.7193, 0.3331));
    float o = floor(r.w * uOriginCount);
    vec3 origin = o < 0.5 ? uO0 : o < 1.5 ? uO1 : uO2;
    float phase = r.x * uSpawn;
    float n = floor(max(uAge - phase, 0.0) / uLife);
    float tb = phase + n * uLife;
    float age = uAge - tb;
    float alive = step(phase, uAge) * step(tb, uDur);

    float th = r.z * 6.2831; float rad = uSpread * sqrt(r.y);
    vec3 dir = normalize(vec3(-sign(origin.x + 0.001) * 0.3 + cos(th) * rad, 1.0, 0.3 + sin(th) * rad));
    dir *= 0.72 + 0.28 * h(r.x * 91.0 + r.y);
    // Papier sinkt verschieden schnell; Landezeit näherungsweise aus der Höhe (der Ausstoß ist dann längst abgeklungen)
    float fall = 0.5 + 0.3 * h(r.y * 13.0);
    vec3 at = origin + dir * uSpeed / uDrag;
    float ground = floorAt(at.xz);
    float tLand = max((at.y - ground) / fall, 0.5);
    float t = min(age, tLand);
    vec3 p = origin + dir * uSpeed * (1.0 - exp(-uDrag * t)) / uDrag;
    p.y -= fall * t;
    p.x += sin(t * 1.9 + r.z * 6.28) * 0.35;
    p.z += cos(t * 1.6 + r.x * 6.28) * 0.25;
    float landed = step(tLand, age);
    ground = floorAt(p.xz);
    p.y = mix(max(p.y, ground + 0.01), ground + 0.004 + 0.003 * r.y, landed);

    // Schnipsel taumelt um eine eigene Achse; gelandet liegt er flach mit zufälliger Drehung
    vec3 axis = normalize(vec3(r.y - 0.5, r.z - 0.5, r.w - 0.5) + vec3(0.001, 0.0, 0.0));
    float ang = t * (4.0 + 7.0 * r.y) + r.x * 6.28;
    vec3 local = position * uSize * (0.8 + 0.4 * r.x);
    vec3 nrm = vec3(0.0, 0.0, 1.0);
    if (landed > 0.5) {
      local = rot(vec3(local.x, 0.0, -local.y), vec3(0.0, 1.0, 0.0), r.z * 6.28);
      nrm = vec3(0.0, 1.0, 0.0);
    } else {
      local = rot(local, axis, ang);
      nrm = rot(nrm, axis, ang);
    }
    float l01 = clamp(age / uLife, 0.0, 1.0);
    float dist = length(cameraPosition - p);
    local *= alive * (1.0 - smoothstep(0.9, 1.0, l01)) * smoothstep(0.6, 1.2, dist);
    vec3 wp = p + local;
    vN = nrm; vW = wp;
    vPick = h(r.z * 7.1 + r.w);
    vFoil = step(0.7, h(r.x * 3.3 + r.y));
    vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const confettiFragment = /* glsl */ `
  varying vec3 vN; varying vec3 vW; varying float vPick; varying float vFoil;
  uniform vec3 uP0, uP1, uP2, uP3;
  ${LIGHT}
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 v = normalize(cameraPosition - vW);
    vec3 c;
    if (vFoil > 0.5) {
      // Folie: dunkel, bis sie das Licht spiegelt – dann blitzt sie auf
      vec3 metal = vPick < 0.5 ? vec3(0.95, 0.78, 0.38) : vec3(0.85, 0.88, 0.92);
      float spec = pow(max(dot(n, normalize(KEY + v)), 0.0), 36.0);
      c = metal * (0.18 + 0.35 * abs(dot(n, KEY))) + (vec3(1.0) + uWash) * spec * 1.6;
    } else {
      // Papier: beidseitig matt, etwas durchscheinend
      vec3 base = vPick < 0.25 ? uP0 : vPick < 0.5 ? uP1 : vPick < 0.75 ? uP2 : uP3;
      c = base * (0.35 * hemi(n) + 0.75 * abs(dot(n, KEY)) + 0.25 * uWash);
    }
    gl_FragColor = vec4(c * uLight, 1.0);
    #include <fog_fragment>
  }
`;

function instanced(base: BufferGeometry, count: number, seed: string) {
  const r = rng(seed);
  const g = new InstancedBufferGeometry();
  g.index = base.index;
  for (const [name, attr] of Object.entries(base.attributes)) g.setAttribute(name, attr);
  g.setAttribute(
    "aRand",
    new InstancedBufferAttribute(
      new Float32Array(count * 4).map(() => r.next()),
      4,
    ),
  );
  g.instanceCount = count;
  return g;
}

/** Licht-Uniforms: Grundlicht (wie SceneLights), Bühnenfarbe, Blackout */
function lightUniforms(ground: string) {
  return {
    uSky: { value: new Color("#ffffff") },
    uGround: { value: new Color(ground) },
    uWash: { value: new Color("#000000") },
    uLight: { value: 1 },
  };
}

/** Pro Frame: aktiven Einsatz übernehmen (oder ausblenden), Licht nachführen */
function applyCue(m: Mesh, cue: ActiveCue | undefined, lights: LightFrame | null | undefined, spawn: number, wash: number) {
  m.visible = !!cue;
  if (!cue) return;
  const u = (m.material as ShaderMaterial).uniforms;
  u.uAge!.value = cue.ageMs / 1000;
  u.uDur!.value = cue.durationMs / 1000;
  u.uSpawn!.value = Math.min(cue.durationMs / 1000, spawn, u.uLife!.value as number);
  u.uSeed!.value = (cue.seed % 997) / 997;
  u.uLight!.value = 1 - 0.8 * (lights?.blackout ?? 0);
  const w = u.uWash!.value as Color;
  if (lights) w.set(lights.signal.base).multiplyScalar(wash * (0.5 + 0.5 * lights.signal.brightness));
  else w.setRGB(0, 0, 0);
}

/** Anzahl der gezeichneten Instanzen (Qualitätsstufe) */
function setInstances(g: InstancedBufferGeometry, n: number) {
  g.instanceCount = n;
}

export function Foam3D({
  activeRef,
  lightsRef,
  palette,
  scale,
}: {
  activeRef: React.RefObject<ActiveCue[]>;
  lightsRef?: React.RefObject<LightFrame | null>;
  palette: Palette;
  scale: number;
}) {
  const COUNT = 1200;
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => instanced(new IcosahedronGeometry(1, 2), COUNT, "schaum"), []);
  const uniforms = useMemo(() => {
    const v = (p: V3) => new Vector3(...p);
    const [a, b, c, d] = FOAM_CANNONS;
    return UniformsUtils.merge([
      UniformsLib.fog,
      {
        uAge: { value: 0 },
        uDur: { value: 1 },
        uSpawn: { value: 1 },
        uLife: { value: FOAM_LIFE },
        uSeed: { value: 0 },
        uSpeed: { value: 5.5 },
        uSpread: { value: 0.35 },
        uDrag: { value: 1.1 },
        uSize: { value: 0.085 },
        uO0: { value: v(a!.nozzle) },
        uO1: { value: v(b!.nozzle) },
        uO2: { value: v(c!.nozzle) },
        uO3: { value: v(d!.nozzle) },
        uD0: { value: v(a!.aim) },
        uD1: { value: v(b!.aim) },
        uD2: { value: v(c!.aim) },
        uD3: { value: v(d!.aim) },
        ...lightUniforms(palette.dark),
      },
    ]);
  }, [palette.dark]);
  useEffect(() => setInstances(geometry, Math.round(COUNT * scale)), [geometry, scale]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    if (mesh.current)
      applyCue(
        mesh.current,
        activeRef.current.find((c) => c.kind === "schaum"),
        lightsRef?.current,
        Infinity,
        0.55,
      );
  });
  return (
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} visible={false}>
      <shaderMaterial
        args={[{ vertexShader: foamVertex, fragmentShader: foamFragment, uniforms, fog: true }]}
        toneMapped={false}
      />
    </mesh>
  );
}

export function Confetti3D({
  activeRef,
  lightsRef,
  palette,
  theme,
  scale,
}: {
  activeRef: React.RefObject<ActiveCue[]>;
  lightsRef?: React.RefObject<LightFrame | null>;
  palette: Palette;
  theme: Theme;
  scale: number;
}) {
  const COUNT = 1100;
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => instanced(new PlaneGeometry(1, 0.6), COUNT, "konfetti"), []);
  const uniforms = useMemo(() => {
    const v = (p: V3) => new Vector3(...p);
    return UniformsUtils.merge([
      UniformsLib.fog,
      {
        uAge: { value: 0 },
        uDur: { value: 1 },
        uSpawn: { value: 1 },
        uLife: { value: CONFETTI_LIFE },
        uSeed: { value: 0 },
        uSpeed: { value: 9 },
        uSpread: { value: 0.6 },
        uDrag: { value: 2.8 },
        uSize: { value: 0.07 },
        uOriginCount: { value: CONFETTI_ORIGINS.length },
        uO0: { value: v(CONFETTI_ORIGINS[0]!) },
        uO1: { value: v(CONFETTI_ORIGINS[1]!) },
        uO2: { value: v(CONFETTI_ORIGINS[2]!) },
        uP0: { value: new Color(palette.accent) },
        uP1: { value: new Color(palette.dominant) },
        uP2: { value: new Color(palette.light) },
        uP3: { value: new Color(theme.colors.accent) },
        ...lightUniforms(palette.dark),
      },
    ]);
  }, [palette, theme.colors.accent]);
  useEffect(() => setInstances(geometry, Math.round(COUNT * scale)), [geometry, scale]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  // Konfetti wird in einer halben Sekunde verschossen
  useFrame(() => {
    if (mesh.current)
      applyCue(
        mesh.current,
        activeRef.current.find((c) => c.kind === "konfetti"),
        lightsRef?.current,
        0.5,
        0.35,
      );
  });
  return (
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} visible={false}>
      <shaderMaterial
        args={[{ vertexShader: confettiVertex, fragmentShader: confettiFragment, uniforms, fog: true }]}
        side={DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Die Schaumkanonen selbst: Gehäuse mit Düsenring, vorn auf Dreibein-Stativen, hinten an der Traverse */
export function FoamCannons({ accent }: { accent: string }) {
  const units = useMemo(
    () =>
      FOAM_CANNONS.map((c) => ({
        ...c,
        q: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(...c.aim).normalize()),
      })),
    [],
  );
  const metal = <meshStandardMaterial color="#26262c" metalness={0.7} roughness={0.4} />;
  return (
    <group>
      {units.map(({ nozzle: [x, y, z], q, stand }) => (
        <group key={`${x}:${z}`}>
          {stand ? (
            <group position={[x, 0, z]}>
              <mesh position-y={(y - 0.2) / 2}>
                <cylinderGeometry args={[0.03, 0.03, y - 0.2, 8]} />
                {metal}
              </mesh>
              {[0, 1, 2].map((i) => (
                <mesh
                  key={i}
                  position={[Math.sin((i * 2 * Math.PI) / 3) * 0.22, 0.24, Math.cos((i * 2 * Math.PI) / 3) * 0.22]}
                  rotation={[-Math.cos((i * 2 * Math.PI) / 3) * 0.6, 0, Math.sin((i * 2 * Math.PI) / 3) * 0.6]}
                >
                  <cylinderGeometry args={[0.02, 0.02, 0.55, 6]} />
                  {metal}
                </mesh>
              ))}
            </group>
          ) : (
            // Abhängung an der Traverse
            <mesh position={[x, (TRUSS_Y + y) / 2, z - 0.3]}>
              <boxGeometry args={[0.04, TRUSS_Y - y, 0.04]} />
              {metal}
            </mesh>
          )}
          {/* Gehäuse: Achse in Schussrichtung, Düse vorn an der Mündung */}
          <group position={[x, y, z]} quaternion={q}>
            <mesh position-y={-0.22}>
              <cylinderGeometry args={[0.2, 0.17, 0.44, 20]} />
              {metal}
            </mesh>
            <mesh position-y={0.005} rotation-x={Math.PI / 2}>
              <torusGeometry args={[0.17, 0.025, 8, 24]} />
              <meshBasicMaterial color={accent} toneMapped={false} />
            </mesh>
            <mesh position-y={-0.02} rotation-x={Math.PI / 2}>
              <circleGeometry args={[0.16, 20]} />
              <meshStandardMaterial color="#d9dde3" roughness={0.9} side={DoubleSide} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}
