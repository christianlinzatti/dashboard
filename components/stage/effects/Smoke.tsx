"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  type ShaderMaterial,
} from "three";
import type { Choreography } from "@/lib/dance/plan";
import { rng } from "@/lib/dance/rng";
import type { LightFrame } from "@/lib/stage/lights";
import { activeBursts, BURST_MS, groundFogLevel, planSmoke, PUFF_LIFE_MS, SMOKE_MACHINES } from "@/lib/stage/smoke";
import type { Frame } from "../types";
import { NOT_ON_SCREENS } from "../layout";

/** Weiche, unregelmäßige Nebelwolke (einmal gezeichnet, für alle Teilchen) */
function puffTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const t = new CanvasTexture(c);
  if (!g) return t;
  const r = rng("nebel");
  for (let i = 0; i < 14; i++) {
    const x = 64 + (r.next() - 0.5) * 50;
    const y = 64 + (r.next() - 0.5) * 40;
    const rad = 22 + r.next() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, "rgba(255,255,255,0.22)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  return t;
}

const v3 = (p: readonly number[]) => `vec3(${p.map((n) => n.toFixed(2)).join(", ")})`;

/**
 * Bühnennebel: Bodennebel (Trockeneis) und Schwaden aus zwei Nebelmaschinen – wenige große, weiche Teilchen in einem
 * Zeichenaufruf, Bewegung im Vertex-Shader, Farbe aus dem Bühnenlicht. Nahe an der Kamera ausgeblendet, damit keine
 * bildschirmfüllenden Flächen entstehen (das bremst den Pi am meisten). Ab Qualität „mittel“.
 */
export function Smoke({
  choreo,
  frameRef,
  lightsRef,
  ground,
  burst,
}: {
  choreo: Choreography;
  frameRef: React.RefObject<Frame>;
  lightsRef: React.RefObject<LightFrame | null>;
  /** Anzahl Teilchen Bodennebel bzw. Maschinen-Schwaden (je Qualitätsstufe) */
  ground: number;
  burst: number;
}) {
  const size = useThree((s) => s.size);
  const mat = useRef<ShaderMaterial>(null);
  const bursts = useMemo(() => planSmoke(choreo), [choreo]);
  const tex = useMemo(() => puffTexture(), []);
  const geometry = useMemo(() => {
    const base = new PlaneGeometry(1, 1);
    const g = new InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.getAttribute("position"));
    g.setAttribute("uv", base.getAttribute("uv"));
    const n = ground + burst;
    const r = rng("nebel-teilchen");
    const seed = new Float32Array(n * 4).map(() => r.next());
    // 0 = Boden, 1 = Stoß A, 2 = Stoß B (die beiden jüngsten Stöße)
    const kind = Float32Array.from({ length: n }, (_, i) => (i < ground ? 0 : (i - ground) % 2 === 0 ? 1 : 2));
    g.setAttribute("aSeed", new InstancedBufferAttribute(seed, 4));
    g.setAttribute("aKind", new InstancedBufferAttribute(kind, 1));
    g.instanceCount = n;
    return g;
  }, [ground, burst]);
  useEffect(
    () => () => {
      geometry.dispose();
      tex.dispose();
    },
    [geometry, tex],
  );
  const uniforms = useMemo(
    () => ({
      uTex: { value: tex },
      uTime: { value: 0 },
      uGround: { value: 0 },
      uAgeA: { value: -1 },
      uStrA: { value: 0 },
      uAgeB: { value: -1 },
      uStrB: { value: 0 },
      uColA: { value: new Color("#ffffff") },
      uColB: { value: new Color("#ffffff") },
      uLight: { value: 1 },
      uPx: { value: 500 },
    }),
    [tex],
  );
  const ballad = choreo.crowdStyle === "ballade";

  useFrame(({ camera, gl }) => {
    const u = mat.current?.uniforms;
    const lf = lightsRef.current;
    if (!u || !lf) return;
    const f = frameRef.current;
    const t = f.t;
    u.uTime!.value = t / 1000;
    const level = f.playing ? groundFogLevel(lf.scene, ballad) : 0.5;
    u.uGround!.value = level;
    const active = f.playing ? activeBursts(bursts, t) : [];
    const [a, b] = [active[0], active[1]];
    u.uAgeA!.value = a ? a.ageMs / 1000 : -1;
    u.uStrA!.value = a?.strength ?? 0;
    u.uAgeB!.value = b ? b.ageMs / 1000 : -1;
    u.uStrB!.value = b?.strength ?? 0;
    (u.uColA!.value as Color).set(lf.signal.base);
    (u.uColB!.value as Color).set(lf.heads[0]?.color ?? lf.signal.accent);
    u.uLight!.value = (1 - 0.75 * lf.blackout) * (0.85 + 0.15 * lf.signal.pulse);
    const fov = "fov" in camera ? (camera.fov as number) : 36;
    u.uPx!.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan((fov * Math.PI) / 360));
    // für Tests und Debug
    const label = `${level >= 0.6 ? "boden" : ""}${active.length ? (level >= 0.6 ? ",stoss" : "stoss") : ""}`;
    if (gl.domElement.dataset.smoke !== label) gl.domElement.dataset.smoke = label;
  });

  return (
    <mesh
      geometry={geometry}
      frustumCulled={false}
      // feiner Dunst: auf den kleinen Live-Bildschirmen nicht mitgefilmt
      ref={(m) => m?.layers.set(NOT_ON_SCREENS)}
    >
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
        args={[
          {
            uniforms,
            vertexShader: /* glsl */ `
              attribute vec4 aSeed; attribute float aKind;
              uniform float uTime, uGround, uAgeA, uStrA, uAgeB, uStrB;
              varying vec2 vUv; varying float vAlpha; varying float vMix;
              const float BURST = ${(BURST_MS / 1000).toFixed(2)};
              const float LIFE = ${(PUFF_LIFE_MS / 1000).toFixed(2)};
              void main() {
                vec3 c; float size; float alpha;
                if (aKind < 0.5) {
                  // Bodennebel: liegt flach über Bühne und Bühnenkante, treibt langsam seitlich
                  float drift = uTime * (0.05 + aSeed.w * 0.06);
                  c = vec3(
                    mod(aSeed.x * 10.0 + drift + 5.0, 10.0) - 5.0,
                    0.18 + aSeed.z * 0.22 + 0.05 * sin(uTime * 0.4 + aSeed.w * 9.0),
                    -2.2 + aSeed.y * 6.2
                  );
                  size = 2.2 + aSeed.z * 1.6;
                  // an den Rändern des Streifens weich ausblenden (kein Aufploppen beim Umlaufen)
                  float edge = smoothstep(5.0, 4.0, abs(c.x));
                  alpha = uGround * 0.09 * (0.6 + 0.4 * sin(uTime * 0.3 + aSeed.x * 20.0)) * edge;
                } else {
                  // Schwade einer Nebelmaschine: im Stoß nach und nach ausgeblasen, gebremst, wächst und verblasst
                  float age = aKind < 1.5 ? uAgeA : uAgeB;
                  float str = aKind < 1.5 ? uStrA : uStrB;
                  float p = age - aSeed.y * BURST;
                  bool left = aSeed.x < 0.5;
                  vec3 o = left ? ${v3(SMOKE_MACHINES[0]!.pos)} : ${v3(SMOKE_MACHINES[1]!.pos)};
                  vec3 d = normalize((left ? ${v3(SMOKE_MACHINES[0]!.dir)} : ${v3(SMOKE_MACHINES[1]!.dir)})
                    + vec3(0.0, 0.0, (aSeed.z - 0.5) * 0.6));
                  float pp = max(p, 0.0);
                  c = o + d * (3.6 * (1.0 - exp(-pp * 0.8))) + vec3(sin(pp * 0.5 + aSeed.w * 6.0) * 0.3, pp * 0.06, 0.0);
                  size = 0.7 + 2.6 * (1.0 - exp(-pp * 0.45));
                  alpha = (age < 0.0 || p < 0.0 || p > LIFE) ? 0.0
                    : str * 0.13 * smoothstep(0.0, 0.5, p) * pow(1.0 - p / LIFE, 1.3);
                }
                vec4 mv = viewMatrix * vec4(c, 1.0);
                // langsam drehen, damit die Wolken nicht wie Stempel aussehen
                float a = aSeed.w * 6.2832 + uTime * (0.04 + aSeed.z * 0.05) * (aSeed.x < 0.5 ? 1.0 : -1.0);
                vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy * size;
                mv.xy += q;
                // nah an der Kamera ausblenden: keine Flächen über das ganze Bild (Füllrate auf dem Pi)
                alpha *= smoothstep(1.2, 3.5, -mv.z);
                vAlpha = alpha; vUv = uv; vMix = aSeed.z;
                gl_Position = alpha > 0.001 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
              }
            `,
            fragmentShader: /* glsl */ `
              uniform sampler2D uTex; uniform vec3 uColA, uColB; uniform float uLight;
              varying vec2 vUv; varying float vAlpha; varying float vMix;
              void main() {
                float m = texture2D(uTex, vUv).a;
                // Nebel fängt das Bühnenlicht: Grundton grau, darüber die Farben der Scheinwerfer
                vec3 col = mix(vec3(0.5), mix(uColA, uColB, vMix), 0.7) * uLight;
                gl_FragColor = vec4(col * m * vAlpha * 4.0, 1.0);
              }
            `,
          },
        ]}
      />
    </mesh>
  );
}
