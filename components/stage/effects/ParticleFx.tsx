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
  type Points,
  type ShaderMaterial,
} from "three";
import { rng } from "@/lib/dance/rng";
import type { Palette } from "@/lib/song-context/schema";
import { type ActiveCue } from "@/lib/stage/effects";
import type { Theme } from "@/lib/stage/themes";
import { EMITTERS } from "./emitters";
import { useShaderArgs } from "../shader-args";
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

export function ParticleFx({
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

  const shaderArgs1 = useShaderArgs({ vertexShader, fragmentShader, uniforms });
  return (
    <points ref={pts} geometry={geometry} frustumCulled={false} visible={false}>
      <shaderMaterial
        args={shaderArgs1}
        transparent
        depthWrite={false}
        blending={e.additive ? AdditiveBlending : NormalBlending}
        toneMapped={false}
      />
    </points>
  );
}

/** Beat-Ringe: Druckwellen auf dem Podest, eine pro Schlag. */
