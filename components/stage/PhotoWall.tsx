"use client";

import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { Color, SRGBColorSpace, type ShaderMaterial } from "three";
import type { LightFrame, LightScene } from "@/lib/stage/lights";
import { TRUSS_Z } from "./layout";

const VISIBILITY: Record<LightScene, number> = {
  intro: 0.65,
  outro: 0.65,
  bridge: 0.55,
  instrumental: 0.4,
  strophe: 0.18,
  refrain: 0.12,
  drop: 0.05,
};

/**
 * Band-Foto auf der LED-Wand, als Duoton in den Cover-Farben (passt zur Bühne, lenkt nicht ab).
 * Lädt per Suspense mit – Screenshots warten auf das Bild.
 */
export function PhotoWall({
  url,
  dark,
  accent,
  lightsRef,
}: {
  url: string;
  dark: string;
  accent: string;
  lightsRef: React.RefObject<LightFrame | null>;
}) {
  const tex = useTexture(url, (t) => {
    t.colorSpace = SRGBColorSpace;
  });
  const mat = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTex: { value: tex },
      uDark: { value: new Color(dark) },
      uLight: { value: new Color(accent) },
      uOpacity: { value: 0 },
    }),
    [tex, dark, accent],
  );
  // Seitenverhältnis des Fotos „cover“-artig auf die Wandfläche (10 × 4,4) bringen
  const img = tex.image as { width?: number; height?: number } | undefined;
  const aspect = img?.width && img?.height ? img.width / img.height : 16 / 10;
  const wall = 10 / 4.4;
  const repeat: [number, number] = aspect > wall ? [wall / aspect, 1] : [1, aspect / wall];
  const offset: [number, number] = [(1 - repeat[0]) / 2, (1 - repeat[1]) / 2];

  useFrame(() => {
    const f = lightsRef.current;
    const u = mat.current?.uniforms;
    if (!u || !f) return;
    const target = VISIBILITY[f.scene] * (0.7 + 0.3 * f.signal.pulse);
    u.uOpacity!.value += (target - (u.uOpacity!.value as number)) * 0.08;
  });

  return (
    <mesh position={[0, 2.3, TRUSS_Z - 0.48]}>
      <planeGeometry args={[10, 4.4]} />
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        toneMapped={false}
        args={[
          {
            uniforms: { ...uniforms, uRepeat: { value: repeat }, uOffset: { value: offset } },
            vertexShader: /* glsl */ `
              varying vec2 vUv;
              void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
            `,
            fragmentShader: /* glsl */ `
              uniform sampler2D uTex; uniform vec3 uDark; uniform vec3 uLight; uniform float uOpacity;
              uniform vec2 uRepeat; uniform vec2 uOffset;
              varying vec2 vUv;
              void main() {
                vec3 c = texture2D(uTex, vUv * uRepeat + uOffset).rgb;
                float l = dot(c, vec3(0.299, 0.587, 0.114));
                // Ränder weich ausblenden
                float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
                gl_FragColor = vec4(mix(uDark, uLight, l) * 0.9, uOpacity * edge);
              }
            `,
          },
        ]}
      />
    </mesh>
  );
}
