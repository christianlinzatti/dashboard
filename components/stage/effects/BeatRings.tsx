"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Color, type Mesh, type ShaderMaterial } from "three";
import { type ActiveCue } from "@/lib/stage/effects";
import type { Frame } from "../types";
import { useShaderArgs } from "../shader-args";

export function BeatRings({
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
  const shaderArgs1 = useShaderArgs({
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
  });
  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position-y={0.012} visible={false}>
      <circleGeometry args={[4.25, 64]} />
      <shaderMaterial
        ref={mat}
        args={shaderArgs1}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

/** Spiegelkugel mit Lichtpunkten (Jazz-Keller). */
