"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  type Mesh,
  type ShaderMaterial,
} from "three";
import { rng } from "@/lib/dance/rng";
import type { ActiveCue } from "@/lib/stage/effects";
import type { LightFrame } from "@/lib/stage/lights";
import type { Palette } from "@/lib/song-context/schema";
import { useShaderArgs } from "../shader-args";

/** Lebensdauer einer Luftschlange in s (Flug, Herabsegeln, Liegen); passt zu LINGER_MS in lib/stage/effects.ts */
export const STREAMER_LIFE = 12.6;
const COUNT = 180;

/**
 * Luftschlangen im Finale: zwei Kanonen an der Bühnenkante schießen lange, sich kringelnde Bänder hoch über die Menge,
 * die dann langsam herabsegeln und auf den Köpfen liegen bleiben. Ein Zeichenaufruf, Flugbahn im Vertex-Shader.
 */
export function Streamers({
  activeRef,
  lightsRef,
  palette,
  accent,
  scale,
}: {
  activeRef: React.RefObject<ActiveCue[]>;
  lightsRef?: React.RefObject<LightFrame | null>;
  palette: Palette;
  accent: string;
  scale: number;
}) {
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => {
    const base = new PlaneGeometry(0.05, 1, 1, 10);
    const g = new InstancedBufferGeometry();
    g.index = base.index;
    for (const [name, attr] of Object.entries(base.attributes)) g.setAttribute(name, attr);
    const r = rng("luftschlangen");
    g.setAttribute(
      "aRand",
      new InstancedBufferAttribute(
        new Float32Array(COUNT * 4).map(() => r.next()),
        4,
      ),
    );
    g.instanceCount = Math.max(24, Math.round(COUNT * scale));
    return g;
  }, [scale]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = useMemo(
    () => ({
      uAge: { value: 0 },
      uLife: { value: STREAMER_LIFE },
      uLight: { value: 1 },
      uP0: { value: new Color(palette.accent) },
      uP1: { value: new Color(palette.dominant) },
      uP2: { value: new Color(palette.light) },
      uP3: { value: new Color(accent) },
    }),
    [palette, accent],
  );

  useFrame(() => {
    const m = mesh.current;
    if (!m) return;
    const cue = activeRef.current.find((c) => c.kind === "luftschlangen");
    m.visible = !!cue;
    if (!cue) return;
    const u = (m.material as ShaderMaterial).uniforms;
    u.uAge!.value = cue.ageMs / 1000;
    u.uLight!.value = 1 - 0.8 * (lightsRef?.current?.blackout ?? 0);
  });

  const shaderArgs1 = useShaderArgs({
    uniforms,
    vertexShader: /* glsl */ `
              attribute vec4 aRand;
              uniform float uAge, uLife;
              uniform vec3 uP0, uP1, uP2, uP3;
              varying vec3 vCol; varying float vShade;
              vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
              vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
              void main() {
                float side = aRand.x < 0.5 ? -1.0 : 1.0;
                vec3 origin = vec3(side * 3.0, 0.25, 3.9);
                float delay = aRand.y * 0.4;
                float a = max(uAge - delay, 0.0);
                // Schuss: schräg nach oben über die Menge, gebremst; nach dem Scheitel segeln sie langsam herab
                vec3 dir = normalize(vec3(-side * (0.1 + 0.35 * aRand.z) + (aRand.w - 0.5) * 0.9, 1.5 + aRand.z * 0.7, 0.8 + aRand.w * 1.1));
                float speed = 10.0 + aRand.z * 5.0;
                vec3 c = origin + dir * speed * (1.0 - exp(-2.3 * a)) / 2.3;
                float fall = max(a - 0.9, 0.0);
                c.y -= fall * (0.5 + aRand.z * 0.3);
                float drift = min(fall, 1.0);
                c.x += sin(a * 1.7 + aRand.x * 20.0) * 0.55 * drift;
                c.z += cos(a * 1.3 + aRand.y * 20.0) * 0.35 * drift;
                // auf den Köpfen liegen bleiben (die Menge steht tiefer als die Bühne)
                float ground = 0.62 + aRand.w * 0.15;
                float landed = smoothstep(ground + 0.4, ground, c.y);
                c.y = max(c.y, ground);
                // Band: entlang seiner Länge gekringelt, im Flug flatternd
                float v = position.y;
                float flap = 1.0 - 0.8 * landed;
                vec3 local = vec3(
                  position.x + sin(v * 7.0 + a * 4.0 + aRand.x * 30.0) * 0.13 * flap,
                  v * (0.9 + aRand.z * 0.5),
                  sin(v * 5.0 + a * 3.0 + aRand.w * 9.0) * 0.08 * flap
                );
                float tilt = mix(0.35 + 0.55 * sin(a * 1.1 + aRand.y * 10.0), 1.5, landed);
                float yaw = aRand.w * 6.2832 + a * 0.7 * flap;
                vec3 w = c + rotY(rotX(local, tilt), yaw);
                float k = aRand.z;
                vCol = k < 0.25 ? uP0 : k < 0.5 ? uP1 : k < 0.75 ? uP2 : uP3;
                vShade = 0.55 + 0.45 * abs(sin(yaw + v * 3.0 + a));
                float alive = step(delay, uAge) * (1.0 - smoothstep(uLife - 1.5, uLife, uAge));
                gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
                gl_Position *= alive;
              }
            `,
    fragmentShader: /* glsl */ `
              uniform float uLight;
              varying vec3 vCol; varying float vShade;
              void main() { gl_FragColor = vec4(vCol * vShade * 0.9 * uLight, 1.0); }
            `,
  });
  return (
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} visible={false}>
      <shaderMaterial side={DoubleSide} toneMapped={false} args={shaderArgs1} />
    </mesh>
  );
}
