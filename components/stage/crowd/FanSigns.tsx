"use client";

import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  SRGBColorSpace,
  type IUniform,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SIGN_TILES } from "@/lib/stage/fan-signs";
import { MOTION } from "./shared";

/** Kacheln der Schilder-Textur: 2 Spalten × 4 Zeilen */
const COLS = 2;
const ROWS = SIGN_TILES / COLS;
const TILE_W = 256;
const TILE_H = 160;

/** Schilder-Textur: abwechselnd weißer Karton mit Filzstift und schwarzes Schild mit Leuchtschrift */
function signAtlas(texts: string[], accent: string): CanvasTexture | null {
  if (typeof document === "undefined" || !texts.length) return null;
  const c = document.createElement("canvas");
  c.width = TILE_W * COLS;
  c.height = TILE_H * ROWS;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  texts.forEach((text, i) => {
    const x = (i % COLS) * TILE_W;
    const y = Math.floor(i / COLS) * TILE_H;
    const neon = i % 3 === 2;
    ctx.fillStyle = neon ? "#0d0b12" : "#f3ede2";
    ctx.fillRect(x + 4, y + 4, TILE_W - 8, TILE_H - 8);
    // Schrift so groß wie möglich (eine Zeile, bei Bedarf zwei)
    const words = text.split(" ");
    const lines =
      text.length > 12 && words.length > 1
        ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")]
        : [text];
    let size = 72;
    const fits = () => {
      ctx.font = `900 ${size}px system-ui, sans-serif`;
      return lines.every((l) => ctx.measureText(l).width <= TILE_W - 28) && size * lines.length * 1.05 <= TILE_H - 24;
    };
    while (size > 18 && !fits()) size -= 4;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = neon ? accent : text.includes("♥") && text.length <= 3 ? "#e0245e" : i % 2 ? accent : "#141018";
    if (neon) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 18;
    }
    lines.forEach((l, k) => ctx.fillText(l, x + TILE_W / 2, y + TILE_H / 2 + (k - (lines.length - 1) / 2) * size * 1.05));
    ctx.shadowBlur = 0;
  });
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Schild (Brett) über dem Kopf, darunter der Stiel – in Personen-Koordinaten (Blick zur Bühne = +z) */
function signGeometry() {
  const board = new PlaneGeometry(0.78, 0.49).translate(0, 2.08, 0.05);
  const pole = new PlaneGeometry(0.035, 0.42).translate(0, 1.66, 0.05);
  const part = (g: PlaneGeometry, id: number) => {
    g.setAttribute("aPart", new BufferAttribute(new Float32Array(g.getAttribute("position").count).fill(id), 1));
    return g;
  };
  return mergeGeometries([part(board, 0), part(pole, 1)])!;
}

/**
 * Fan-Schilder: einige Leute in den vorderen Reihen halten Schilder hoch (ein Draw-Call). Die Bewegung kommt aus
 * derselben Publikums-Logik wie die Silhouetten – das Schild springt und wiegt mit seinem Träger.
 */
export function FanSigns({
  texts,
  accent,
  holders,
  uniforms,
}: {
  texts: string[];
  accent: string;
  /** Plätze der Träger: je 3 Werte Platz (x, z, Größe) und 4 Zufallswerte */
  holders: { spot: Float32Array; rand: Float32Array; count: number };
  uniforms: Record<string, IUniform>;
}) {
  const atlas = useMemo(() => signAtlas(texts, accent), [texts, accent]);
  const geometry = useMemo(() => {
    const base = signGeometry();
    const g = new InstancedBufferGeometry();
    g.setAttribute("position", base.getAttribute("position"));
    g.setAttribute("uv", base.getAttribute("uv"));
    g.setAttribute("aPart", base.getAttribute("aPart"));
    g.setIndex(base.getIndex());
    g.setAttribute("aSpot", new InstancedBufferAttribute(holders.spot, 3));
    g.setAttribute("aRand", new InstancedBufferAttribute(holders.rand, 4));
    g.setAttribute(
      "aTile",
      new InstancedBufferAttribute(
        Float32Array.from({ length: holders.count }, (_, i) => i % Math.max(texts.length, 1)),
        1,
      ),
    );
    g.instanceCount = holders.count;
    return g;
  }, [holders, texts.length]);
  const signUniforms = useMemo(() => ({ ...uniforms, uAtlas: { value: atlas } }), [uniforms, atlas]);
  useEffect(
    () => () => {
      geometry.dispose();
      atlas?.dispose();
    },
    [geometry, atlas],
  );
  if (!atlas || !holders.count) return null;
  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        side={2}
        args={[
          {
            uniforms: signUniforms,
            vertexShader: /* glsl */ `
              attribute vec3 aSpot; attribute vec4 aRand; attribute float aPart; attribute float aTile;
              ${MOTION}
              uniform float uEnergy;
              varying vec2 vUv; varying float vPart; varying float vTile; varying vec3 vW;
              void main() {
                vec3 p = position;
                // Schild im Takt hoch und runter, leicht schräg – jeder etwas anders
                float bob = (0.04 + 0.05 * uJump) * sin(uBeats * PI + aRand.z * 6.0);
                float tilt = 0.12 * sin(uTime * 0.9 + aRand.x * 9.0);
                vec2 c = vec2(0.0, 1.66);
                vec2 d = p.xy - c;
                p.xy = c + vec2(d.x * cos(tilt) - d.y * sin(tilt), d.x * sin(tilt) + d.y * cos(tilt));
                p.y += bob;
                gOla = ola(aSpot);
                vW = toWorld(p, aSpot, aRand);
                vUv = uv; vPart = aPart; vTile = aTile;
                gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
              }
            `,
            fragmentShader: /* glsl */ `
              uniform sampler2D uAtlas; uniform vec3 uFogColor, uCam; uniform float uFogFar, uEnergy;
              varying vec2 vUv; varying float vPart; varying float vTile; varying vec3 vW;
              void main() {
                if (vPart > 0.5) { gl_FragColor = vec4(mix(vec3(0.12), uFogColor, 0.3), 1.0); return; }
                // von hinten (Kamera hinter dem Publikum) lesbar: Schrift dann gespiegelt zurück
                vec2 uv = vec2(gl_FrontFacing ? vUv.x : 1.0 - vUv.x, vUv.y);
                // Kachelnummer erst runden: interpoliert ist sie mal 1,9999, mal 2,0001 – sonst flackert die Kachel pixelweise
                float tile = floor(vTile + 0.5);
                float col = mod(tile, ${COLS}.0); float row = floor(tile / ${COLS}.0);
                vec2 a = vec2((col + uv.x) / ${COLS}.0, 1.0 - (row + 1.0 - uv.y) / ${ROWS}.0);
                vec3 tex = texture2D(uAtlas, a).rgb;
                // Bühnenlicht von vorn; etwas Grundhelligkeit, damit man sie in jeder Szene lesen kann
                vec3 color = tex * (0.55 + 0.35 * uEnergy);
                float fog = smoothstep(9.0, uFogFar, distance(uCam, vW));
                gl_FragColor = vec4(mix(color, uFogColor, fog * 0.8), 1.0);
              }
            `,
          },
        ]}
      />
    </mesh>
  );
}
