"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, type ShaderMaterial } from "three";
import { rng } from "@/lib/dance/rng";
import type { Choreography } from "@/lib/dance/plan";
import { DRONE_CENTER, DRONE_SIZE, dronesAt, heartPoint } from "@/lib/stage/staging";
import type { Frame } from "./types";
import { useShaderArgs } from "./shader-args";

const COUNT = 220;
const STAGES = { schwarm: 0, herz: 1, wort: 2, aus: 0 } as const;

/** Punkte eines Worts (Großbuchstaben) als Umriss-Raster, in Einheiten der Drohnen-Bildgröße (Mitte bei 0) */
function wordPoints(word: string, n: number): Array<[number, number]> {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return [];
  const text = word.toUpperCase().slice(0, 12);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = 56;
  g.font = `900 ${size}px sans-serif`;
  while (g.measureText(text).width > 240 && size > 14) g.font = `900 ${(size -= 2)}px sans-serif`;
  g.fillText(text, 128, 34);
  const data = g.getImageData(0, 0, 256, 64).data;
  const cells: Array<[number, number]> = [];
  for (let y = 0; y < 64; y += 2) for (let x = 0; x < 256; x += 2) if (data[(y * 256 + x) * 4 + 3]! > 128) cells.push([x, y]);
  if (!cells.length) return [];
  // gleichmäßig über die Buchstaben verteilen; Breite 256 px ≙ 2,8 Bildgrößen
  return Array.from({ length: n }, (_, i) => {
    const [x, y] = cells[Math.floor((i * cells.length) / n)]!;
    return [((x - 128) / 256) * 2.8, ((32 - y) / 64) * 0.7];
  });
}

/**
 * Drohnen-Show am Nachthimmel (Freiluftbühnen, Outro): starten hinter der Bühne, sammeln sich als Schwarm, formen ein
 * Herz und dann das Refrain-Wort. Ein Zeichenaufruf (Punkte), Übergänge im Vertex-Shader.
 */
export function Drones({
  choreo,
  frameRef,
  word,
  colors,
  scale,
}: {
  choreo: Choreography;
  frameRef: React.RefObject<Frame>;
  word: string;
  colors: [string, string];
  scale: number;
}) {
  const size = useThree((s) => s.size);
  const mat = useRef<ShaderMaterial>(null);
  const n = Math.max(80, Math.round(COUNT * Math.min(scale, 1)));
  const geometry = useMemo(() => {
    const r = rng(`drohnen:${word}`);
    const g = new BufferGeometry();
    const launch = new Float32Array(n * 3);
    const swarm = new Float32Array(n * 3);
    const heart = new Float32Array(n * 3);
    const text = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const letters = wordPoints(word, n);
    const [cx, cy, cz] = DRONE_CENTER;
    for (let i = 0; i < n; i++) {
      launch.set([(r.next() - 0.5) * 16, 0.5, cz + 6 + r.next() * 4], i * 3);
      swarm.set([cx + (r.next() - 0.5) * 18, cy + (r.next() - 0.5) * 7, cz + (r.next() - 0.5) * 6], i * 3);
      const [hx, hy] = heartPoint(i, n);
      heart.set([cx + hx * DRONE_SIZE, cy + hy * DRONE_SIZE, cz], i * 3);
      const [wx, wy] = letters[i] ?? heartPoint(i, n);
      text.set([cx + wx * DRONE_SIZE, cy + wy * DRONE_SIZE, cz], i * 3);
      seed[i] = r.next();
    }
    g.setAttribute("position", new BufferAttribute(launch, 3));
    g.setAttribute("aSwarm", new BufferAttribute(swarm, 3));
    g.setAttribute("aHeart", new BufferAttribute(heart, 3));
    g.setAttribute("aWord", new BufferAttribute(text, 3));
    g.setAttribute("aSeed", new BufferAttribute(seed, 1));
    return g;
  }, [n, word]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const uniforms = useMemo(
    () => ({
      uStage: { value: 0 },
      uW: { value: 0 },
      uLevel: { value: 0 },
      uTime: { value: 0 },
      uPx: { value: 500 },
      uA: { value: new Color(colors[0]) },
      uB: { value: new Color(colors[1]) },
    }),
    [colors],
  );

  useFrame(({ camera, gl }) => {
    const u = mat.current?.uniforms;
    if (!u) return;
    const f = frameRef.current;
    const d = dronesAt(choreo.staging?.drones, f.t);
    u.uStage!.value = STAGES[d.formation];
    u.uW!.value = d.w;
    u.uLevel!.value = d.level;
    u.uTime!.value = f.t / 1000;
    const fov = "fov" in camera ? (camera.fov as number) : 40;
    u.uPx!.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan((fov * Math.PI) / 360));
    if (gl.domElement.dataset.drones !== d.formation) gl.domElement.dataset.drones = d.formation;
  });

  const shaderArgs1 = useShaderArgs({
    uniforms,
    vertexShader: /* glsl */ `
              attribute vec3 aSwarm, aHeart, aWord; attribute float aSeed;
              uniform float uStage, uW, uLevel, uTime, uPx;
              uniform vec3 uA, uB;
              varying vec3 vColor;
              void main() {
                // Übergang: Start → Schwarm, Schwarm → Herz, Herz → Wort (versetzt je Drohne: wirkt wie ein Fließen)
                float w = smoothstep(aSeed * 0.35, aSeed * 0.35 + 0.65, uW);
                vec3 from = uStage < 0.5 ? position : uStage < 1.5 ? aSwarm : aHeart;
                vec3 to = uStage < 0.5 ? aSwarm : uStage < 1.5 ? aHeart : aWord;
                vec3 p = mix(from, to, w);
                // leichtes Schweben in der Luft
                p += vec3(sin(uTime * 0.9 + aSeed * 40.0), cos(uTime * 0.7 + aSeed * 30.0), 0.0) * 0.08;
                vec3 heart = vec3(1.0, 0.18, 0.32);
                vColor = (uStage < 0.5 ? mix(uA, uB, aSeed) : uStage < 1.5 ? mix(mix(uA, uB, aSeed), heart, w) : mix(heart, vec3(1.0), w))
                  * uLevel * (0.8 + 0.2 * sin(uTime * 3.0 + aSeed * 60.0));
                vec4 mv = modelViewMatrix * vec4(p, 1.0);
                gl_Position = projectionMatrix * mv;
                gl_PointSize = step(0.01, uLevel) * 0.32 * uPx / max(-mv.z, 0.1);
              }
            `,
    fragmentShader: /* glsl */ `
              varying vec3 vColor;
              void main() {
                float d = length(gl_PointCoord - 0.5);
                gl_FragColor = vec4(vColor * smoothstep(0.5, 0.0, d) * 1.4, 1.0);
              }
            `,
  });
  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
        args={shaderArgs1}
      />
    </points>
  );
}
