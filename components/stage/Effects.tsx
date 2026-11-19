"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Vector3,
  type Mesh,
  type Points,
  type ShaderMaterial,
} from "three";
import type { Choreography } from "@/lib/dance/plan";
import { rng } from "@/lib/dance/rng";
import type { Palette } from "@/lib/song-context/schema";
import { songContext } from "@/lib/song-context/store";
import { dropCues, effectsAt, snareFlame, type ActiveCue, type Cue } from "@/lib/stage/effects";
import type { EffectKind, Theme } from "@/lib/stage/themes";
import { Confetti3D, Foam3D, FoamCannons } from "./Effects3D";
import type { Frame } from "./types";
import type { LightFrame } from "@/lib/stage/lights";

type V3 = [number, number, number];

/**
 * Partikel-Emitter. Alles wird im Vertex-Shader aus (Alter des Einsatzes, Zufallswerten) berechnet –
 * zustandslos: gleiche Songzeit → gleiches Bild (Screenshots, Vor-/Zurückspulen), kaum CPU-Last auf dem Pi.
 * mode: 0 Fontäne (Pyro, Funken), 1 Feuerwerk (Kugelbursts), 3 CO₂-Jet, 4 Sternschnuppe.
 * Konfetti und Schaum sind echte 3D-Körper (Effects3D.tsx).
 */
type Emitter = {
  mode: 0 | 1 | 3 | 4;
  count: number;
  origins: V3[];
  life: number;
  /** Ausstoß-Fenster in s (Rest der Dauer: Partikel fliegen nur noch) */
  spawn?: number;
  speed: number;
  spread: number;
  gravity: number;
  drag: number;
  size: number;
  grow: number;
  /** Helligkeit (viele überlagerte, große Partikel würden sonst weiß ausbrennen) */
  gain?: number;
  additive: boolean;
};

const EMITTERS: Record<Exclude<EffectKind, "ringe" | "glitzer" | "konfetti" | "schaum">, Emitter> = {
  pyro: {
    mode: 0,
    count: 1000,
    origins: [
      [-3.2, 0, -1.8],
      [3.2, 0, -1.8],
      [-1.7, 0, -2.4],
      [1.7, 0, -2.4],
    ],
    life: 1.2,
    speed: 8.5,
    spread: 0.16,
    gravity: 9.8,
    drag: 0.4,
    size: 0.16,
    grow: -0.5,
    additive: true,
  },
  funken: {
    mode: 0,
    count: 700,
    origins: [
      [-2.9, 0, 1.0],
      [2.9, 0, 1.0],
      [-3.6, 0, -0.8],
      [3.6, 0, -0.8],
    ],
    life: 1.1,
    speed: 6.2,
    spread: 0.38,
    gravity: 9.8,
    drag: 0.2,
    size: 0.06,
    grow: 0,
    additive: true,
  },
  co2: {
    mode: 3,
    count: 420,
    origins: [
      [-3.4, 0, -1.0],
      [3.4, 0, -1.0],
      [-1.2, 0, -2.4],
      [1.2, 0, -2.4],
    ],
    life: 1.5,
    speed: 13,
    spread: 0.1,
    gravity: -0.6,
    drag: 2.6,
    size: 0.55,
    grow: 2.2,
    additive: true,
  },
  // Flammenwerfer: kurze, breite Feuersäulen hinter den Tänzern
  flammen: {
    mode: 0,
    count: 420,
    origins: [
      [-3.9, 0, -1.9],
      [3.9, 0, -1.9],
      [-2.0, 0, -2.3],
      [2.0, 0, -2.3],
    ],
    life: 0.42,
    speed: 9.5,
    spread: 0.06,
    gravity: 3,
    drag: 1.6,
    size: 0.3,
    grow: 0.9,
    gain: 0.3,
    additive: true,
  },
  feuerwerk: {
    mode: 1,
    count: 1400,
    origins: [
      // seitlich neben der LED-Wand, wo der Himmel zu sehen ist
      [-6.6, 2.2, -8.5],
      [6.8, 2.8, -9],
      [-7.0, 3.2, -9.5],
      [6.4, 1.9, -8],
    ],
    life: 2.3,
    speed: 2.7,
    spread: 0,
    gravity: 1.6,
    drag: 0.9,
    size: 0.22,
    grow: -0.4,
    additive: true,
  },
  sternschnuppen: {
    mode: 4,
    count: 240,
    origins: [[0, 4, -16]],
    life: 0.9,
    speed: 16,
    spread: 0,
    gravity: 0,
    drag: 0,
    size: 0.2,
    grow: 0,
    additive: true,
  },
};

const vertexShader = /* glsl */ `
  attribute vec4 aRand;
  uniform float uAge, uDur, uSpawn, uLife, uSpeed, uSpread, uGravity, uDrag, uSize, uGrow, uPx, uMode, uIntensity, uSeed;
  uniform vec3 uO0, uO1, uO2, uO3; uniform float uOriginCount;
  varying float vAlpha; varying float vHeat; varying float vPick;

  float h(float n) { return fract(sin(n) * 43758.5453); }
  vec3 originOf(float e) { return e < 0.5 ? uO0 : e < 1.5 ? uO1 : e < 2.5 ? uO2 : uO3; }

  void main() {
    vec4 r = fract(aRand + uSeed * vec4(0.1371, 0.2719, 0.7193, 0.3331));
    vec3 origin = originOf(floor(r.w * uOriginCount));
    float age; float alive; vec3 dir; float life = uLife;

    if (uMode > 0.5 && uMode < 1.5) {
      // Feuerwerk: 8 Raketen nacheinander, jede ein Kugelburst
      float k = floor(aRand.w * 8.0);
      float t0 = k * 1.6 + 0.4 * h(k + uSeed);
      age = uAge - t0;
      alive = step(0.0, age) * step(age, life) * step(t0, uDur);
      origin = originOf(mod(k, 4.0)) + vec3(h(k * 3.1 + uSeed) * 1.2 - 0.6, h(k * 1.7 + uSeed) * 1.2, 0.0);
      float z = r.y * 2.0 - 1.0; float th = r.z * 6.2831; float rr = sqrt(1.0 - z * z);
      dir = vec3(rr * cos(th), z, rr * sin(th)) * (0.85 + 0.15 * r.x);
      vPick = h(k * 7.7 + uSeed);
    } else if (uMode > 3.5) {
      // Sternschnuppe: 6 Bahnen, Partikel als Schweif hinter dem Kopf
      float s = floor(aRand.w * 6.0);
      float period = 2.2 + s * 0.55;
      float local = uAge + s * 0.93;
      float cyc = floor(local / period);
      float seed = h(s * 12.9 + cyc * 3.1 + uSeed);
      age = mod(local, period) - aRand.x * 0.16;
      alive = step(0.0, age) * step(age, life) * step(uAge, uDur);
      origin = vec3(-8.0 + 16.0 * seed, 3.2 + 2.6 * h(seed * 7.3), -16.0 - 4.0 * h(seed * 2.1));
      dir = normalize(vec3(origin.x > 0.0 ? -1.0 : 1.0, -0.42, 0.0));
      vPick = aRand.x;
    } else {
      // Fontäne / Jet: Partikel werden über das Ausstoß-Fenster verteilt und recyceln mit ihrer Lebensdauer
      float phase = r.x * uSpawn;
      float n = floor(max(uAge - phase, 0.0) / life);
      float tb = phase + n * life;
      age = uAge - tb;
      alive = step(phase, uAge) * step(tb, uDur);
      float th = r.z * 6.2831; float rad = uSpread * sqrt(r.y);
      dir = vec3(cos(th) * rad, 1.0, sin(th) * rad);
      dir = normalize(dir) * (0.72 + 0.28 * h(r.x * 91.0 + r.y));
      vPick = r.y;
    }

    // Flug mit Luftwiderstand: x = v (1 - e^{-k t}) / k
    float k = max(uDrag, 0.001);
    vec3 p = origin + dir * uSpeed * (1.0 - exp(-k * age)) / k;
    p.y -= 0.5 * uGravity * age * age;
    float l01 = clamp(age / life, 0.0, 1.0);
    vHeat = l01;
    float fade = uMode > 3.5 ? (1.0 - aRand.x) * (1.0 - l01) : 1.0 - l01;
    alive *= step(-0.25, p.y);
    vAlpha = alive * uIntensity * fade;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = alive * max(uSize * (1.0 + uGrow * l01), 0.01) * uPx / max(-mv.z, 0.1);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorA, uColorB, uP0, uP1; uniform float uMode;
  varying float vAlpha; varying float vHeat; varying float vPick;
  void main() {
    if (vAlpha <= 0.001) discard;
    vec2 q = gl_PointCoord - 0.5;
    float d = length(q);
    float soft = uMode > 2.5 && uMode < 3.5 ? smoothstep(0.5, 0.0, d) * 0.22 : smoothstep(0.5, 0.1, d);
    vec3 c;
    if (uMode > 0.5 && uMode < 1.5) c = mix(vPick < 0.5 ? uP0 : uP1, vec3(1.0), (1.0 - vHeat) * 0.6);
    else if (uMode > 3.5) c = mix(vec3(1.0), uColorB, vPick);
    else c = mix(uColorA, uColorB, vHeat);
    gl_FragColor = vec4(c * soft * vAlpha, 1.0);
  }
`;

function randomGeometry(count: number, seed: string) {
  const r = rng(seed);
  const pos = new Float32Array(count * 3);
  const rand = new Float32Array(count * 4).map(() => r.next());
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("aRand", new BufferAttribute(rand, 4));
  return g;
}

function ParticleFx({
  kind,
  activeRef,
  theme,
  palette,
  scale,
}: {
  kind: keyof typeof EMITTERS;
  activeRef: React.RefObject<ActiveCue[]>;
  theme: Theme;
  palette: Palette;
  scale: number;
}) {
  const e = EMITTERS[kind];
  const pts = useRef<Points>(null);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const geometry = useMemo(() => randomGeometry(e.count, kind), [e.count, kind]);
  const uniforms = useMemo(() => {
    const o = (i: number) => new Vector3(...(e.origins[i] ?? e.origins[0]!));
    // echte Flammen sind orange – nur Synthwave/Weltraum behalten ihre Neon-/Plasmafarben
    const warm = ["club", "festival", "jazz", "stadion", "strand"].includes(theme.id);
    const fire =
      kind === "co2"
        ? (["#ffffff", "#cfe6ff"] as const)
        : kind === "flammen" && warm
          ? (["#ffe9a8", "#ff3c0a"] as const)
          : theme.fire;
    return {
      uAge: { value: 0 },
      uDur: { value: 1 },
      uSpawn: { value: 1 },
      uLife: { value: e.life },
      uSpeed: { value: e.speed },
      uSpread: { value: e.spread },
      uGravity: { value: e.gravity },
      uDrag: { value: e.drag },
      uSize: { value: e.size },
      uGrow: { value: e.grow },
      uPx: { value: 500 },
      uMode: { value: e.mode },
      uIntensity: { value: 1 },
      uSeed: { value: 0 },
      uOriginCount: { value: e.origins.length },
      uO0: { value: o(0) },
      uO1: { value: o(1) },
      uO2: { value: o(2) },
      uO3: { value: o(3) },
      uColorA: { value: new Color(fire[0]) },
      uColorB: { value: new Color(fire[1]) },
      uP0: { value: new Color(palette.accent) },
      uP1: { value: new Color(palette.dominant) },
    };
  }, [e, kind, theme, palette]);

  // nur ein Teil der Partikel je nach Qualitätsstufe (Zufallswerte sind gleichverteilt → Ausschnitt genügt)
  useEffect(() => void geometry.setDrawRange(0, Math.round(e.count * scale)), [geometry, e.count, scale]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera }) => {
    const p = pts.current;
    if (!p) return;
    const cue = activeRef.current.find((c) => c.kind === kind);
    p.visible = !!cue;
    if (!cue) return;
    const m = p.material as ShaderMaterial;
    const fov = "fov" in camera ? (camera.fov as number) : 36;
    m.uniforms.uPx!.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan((fov * Math.PI) / 360));
    m.uniforms.uAge!.value = cue.ageMs / 1000;
    m.uniforms.uDur!.value = cue.durationMs / 1000;
    m.uniforms.uSpawn!.value = Math.min(cue.durationMs / 1000, e.spawn ?? Infinity, e.life);
    m.uniforms.uIntensity!.value = cue.intensity * (e.gain ?? 1);
    m.uniforms.uSeed!.value = (cue.seed % 997) / 997;
  });

  return (
    <points ref={pts} geometry={geometry} frustumCulled={false} visible={false}>
      <shaderMaterial
        args={[{ vertexShader, fragmentShader, uniforms }]}
        transparent
        depthWrite={false}
        blending={e.additive ? AdditiveBlending : NormalBlending}
        toneMapped={false}
      />
    </points>
  );
}

/** Beat-Ringe: Druckwellen auf dem Podest, eine pro Schlag. */
function BeatRings({
  activeRef,
  frameRef,
  beatMs,
  color,
}: {
  activeRef: React.RefObject<ActiveCue[]>;
  frameRef: React.RefObject<Frame>;
  beatMs: number;
  color: string;
}) {
  const mesh = useRef<Mesh>(null);
  const mat = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uPhase: { value: 0 }, uBeat: { value: beatMs / 1000 }, uLevel: { value: 0 }, uColor: { value: new Color(color) } }),
    [beatMs, color],
  );
  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const cue = activeRef.current.find((c) => c.kind === "ringe");
    m.visible = !!cue;
    if (!cue) return;
    const f = frameRef.current;
    const beats = (f.t - (f.anchorMs ?? 0)) / beatMs;
    const fade = Math.min(1, (cue.durationMs + 600 - cue.ageMs) / 600);
    const u = mat.current?.uniforms;
    if (!u) return;
    u.uPhase!.value = ((beats % 1) + 1) % 1;
    u.uLevel!.value = cue.intensity * Math.max(0, fade) * (0.7 + 0.3 * f.energy);
  });
  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position-y={0.012} visible={false}>
      <circleGeometry args={[4.25, 64]} />
      <shaderMaterial
        ref={mat}
        args={[
          {
            uniforms,
            vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
            fragmentShader: /* glsl */ `
              uniform float uPhase, uLevel; uniform vec3 uColor; varying vec2 vUv;
              void main() {
                float d = length(vUv - 0.5) * 2.0;
                float a = 0.0;
                // drei Ringe: aktueller Schlag und die beiden davor
                for (int i = 0; i < 3; i++) {
                  float age = uPhase + float(i);
                  float r = 0.12 + age * 0.34;
                  a += smoothstep(0.035, 0.0, abs(d - r)) * (1.0 - age / 3.0);
                }
                gl_FragColor = vec4(uColor * a * uLevel * 0.9, 1.0);
              }
            `,
          },
        ]}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Spiegelkugel mit Lichtpunkten (Jazz-Keller). */
function MirrorBall({
  activeRef,
  frameRef,
  color,
}: {
  activeRef: React.RefObject<ActiveCue[]>;
  frameRef: React.RefObject<Frame>;
  color: string;
}) {
  const ball = useRef<Mesh>(null);
  const dots = useRef<Points>(null);
  const geometry = useMemo(() => {
    const r = rng("glitzer");
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Punkte auf einer großen Kugel um die Spiegelkugel (Lichtflecken im Raum)
      const z = r.next() * 1.6 - 0.9;
      const th = r.next() * Math.PI * 2;
      const rr = Math.sqrt(1 - z * z);
      const R = 5 + r.next() * 3;
      pos.set([rr * Math.cos(th) * R, z * R * 0.6, rr * Math.sin(th) * R], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    return g;
  }, []);
  useFrame(() => {
    const cue = activeRef.current.find((c) => c.kind === "glitzer");
    const t = frameRef.current.t / 1000;
    if (ball.current) ball.current.rotation.y = t * 0.4;
    if (dots.current) {
      dots.current.visible = !!cue;
      dots.current.rotation.y = t * 0.4;
      (dots.current.material as { opacity: number }).opacity = (cue?.intensity ?? 0) * (0.45 + 0.25 * frameRef.current.pulse);
    }
  });
  return (
    <group position={[0, 3.7, 0.4]}>
      <mesh ref={ball}>
        <icosahedronGeometry args={[0.32, 2]} />
        <meshStandardMaterial
          color="#d8d8e0"
          metalness={1}
          roughness={0.15}
          flatShading
          emissive={color}
          emissiveIntensity={0.15}
        />
      </mesh>
      <points ref={dots} geometry={geometry} visible={false}>
        <pointsMaterial
          color={color}
          size={0.06}
          transparent
          opacity={0.5}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

/**
 * Spezialeffekte der Bühne. Die Einsätze plant die Effekt-Regie (lib/stage/effects.ts);
 * hier werden nur die Effekte des aktuellen Themas aufgebaut und pro Frame die aktiven gezeigt.
 */
export function Effects({
  cues,
  choreo,
  theme,
  palette,
  frameRef,
  lightsRef,
  scale,
}: {
  cues: Cue[];
  choreo: Choreography;
  theme: Theme;
  palette: Palette;
  frameRef: React.RefObject<Frame>;
  lightsRef?: React.RefObject<LightFrame | null>;
  scale: number;
}) {
  const active = useRef<ActiveCue[]>([]);
  const lastKinds = useRef("");
  const drop = useRef<{ at: number | null; cues: Cue[] }>({ at: null, cues: [] });
  // Snare-Flammen (Mikrofon): die letzten Stöße, solange sie noch brennen
  const snare = useRef<{ heard: number | null; cues: Cue[] }>({ heard: null, cues: [] });

  // Aktive Einsätze vor den Emittern bestimmen (Priorität nach dem Director)
  useFrame(({ gl }) => {
    const f = frameRef.current;
    if (f.dropMs !== drop.current.at)
      drop.current = { at: f.dropMs, cues: f.dropMs !== null ? dropCues(f.dropMs, choreo, theme) : [] };
    const heard = f.micActive ? songContext.getState().live.drums.snare : null;
    if (heard !== snare.current.heard) {
      const last = snare.current.cues.at(-1)?.startMs ?? null;
      const q = snareFlame(choreo, theme, heard, last);
      snare.current = { heard, cues: q ? [...snare.current.cues.slice(-2), q] : snare.current.cues };
    }
    active.current = f.playing ? effectsAt(cues, f.t, [...drop.current.cues, ...snare.current.cues]) : [];
    // für Tests und Debug: aktive Effektarten am Canvas
    const kinds = [...new Set(active.current.map((c) => c.kind))].sort().join(",");
    if (kinds !== lastKinds.current) {
      lastKinds.current = kinds;
      gl.domElement.dataset.fx = kinds;
    }
  }, -0.5);

  const has = (k: EffectKind) => theme.effects.includes(k);
  return (
    <group>
      {(Object.keys(EMITTERS) as Array<keyof typeof EMITTERS>).filter(has).map((k) => (
        <ParticleFx key={k} kind={k} activeRef={active} theme={theme} palette={palette} scale={scale} />
      ))}
      {has("konfetti") && <Confetti3D activeRef={active} lightsRef={lightsRef} palette={palette} theme={theme} scale={scale} />}
      {has("schaum") && (
        <>
          <Foam3D activeRef={active} lightsRef={lightsRef} palette={palette} scale={scale} />
          <FoamCannons accent={theme.colors.accent} />
        </>
      )}
      {has("ringe") && <BeatRings activeRef={active} frameRef={frameRef} beatMs={choreo.beatMs} color={palette.accent} />}
      {has("glitzer") && <MirrorBall activeRef={active} frameRef={frameRef} color={theme.fire[0]} />}
    </group>
  );
}
