"use client";

import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { Color, SRGBColorSpace, type ShaderMaterial } from "three";
import type { LightFrame, LightScene } from "@/lib/stage/lights";
import { TRUSS_Z } from "./layout";

/** Wann das Logo zu sehen ist: ruhige Teile ja, Strophe/Refrain nicht (Lyrics haben Vorrang). */
const VISIBILITY: Record<LightScene, number> = {
  intro: 0.9,
  outro: 0.9,
  instrumental: 0.7,
  bridge: 0.35,
  strophe: 0,
  refrain: 0,
  drop: 0,
};

/** Band-Logo (transparentes PNG, TheAudioDB) vor der LED-Wand, in der Akzentfarbe, pulsiert im Takt. */
export function LogoWall({
  url,
  accent,
  lightsRef,
}: {
  url: string;
  accent: string;
  lightsRef: React.RefObject<LightFrame | null>;
}) {
  const tex = useTexture(url, (t) => {
    t.colorSpace = SRGBColorSpace;
  });
  const mat = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTex: { value: tex }, uColor: { value: new Color(accent) }, uOpacity: { value: 0 } }),
    [tex, accent],
  );
  // Logo „contain“ in einen Bereich von 4,6 × 1,1 einpassen (über den Köpfen, unter der Kopfzeile)
  const img = tex.image as { width?: number; height?: number } | undefined;
  const aspect = img?.width && img?.height ? img.width / img.height : 3;
  const [w, h] = aspect > 4.6 / 1.1 ? [4.6, 4.6 / aspect] : [1.1 * aspect, 1.1];

  useFrame(() => {
    const f = lightsRef.current;
    const u = mat.current?.uniforms;
    if (!u || !f) return;
    const target = VISIBILITY[f.scene] * (0.75 + 0.25 * f.signal.pulse);
    u.uOpacity!.value += (target - (u.uOpacity!.value as number)) * 0.06;
  });

  return (
    <mesh position={[0, 2.45, TRUSS_Z - 0.4]}>
      <planeGeometry args={[w, h]} />
      <shaderMaterial
        ref={mat}
        transparent
        depthWrite={false}
        toneMapped={false}
        args={[
          {
            uniforms,
            vertexShader: /* glsl */ `
              varying vec2 vUv;
              void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
            `,
            fragmentShader: /* glsl */ `
              uniform sampler2D uTex; uniform vec3 uColor; uniform float uOpacity;
              varying vec2 vUv;
              void main() {
                vec4 c = texture2D(uTex, vUv);
                // Form aus dem Alpha-Kanal, Farbe aus dem Cover; helle Logo-Teile leuchten etwas stärker
                float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
                gl_FragColor = vec4(uColor * (0.8 + 0.6 * l), c.a * uOpacity);
              }
            `,
          },
        ]}
      />
    </mesh>
  );
}
