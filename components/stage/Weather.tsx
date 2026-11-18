"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, Vector3, type ShaderMaterial } from "three";
import { rng } from "@/lib/dance/rng";
import type { LightFrame } from "@/lib/stage/lights";
import type { Weather as WeatherKind } from "@/lib/stage/weather";
import type { Frame } from "./types";

/** Wetterzone: über Bühne und Publikum (x, z), Fallhöhe */
const AREA = { x: [-12, 12], z: [-3, 15], top: 9, bottom: -0.3 } as const;
const RAIN = 2200;
const SNOW = 1600;

const rainShader = {
  vertexShader: /* glsl */ `
    attribute vec4 aRand; attribute float aEnd;
    uniform float uTime; uniform vec3 uCam;
    varying float vA;
    void main() {
      float h = ${(AREA.top - AREA.bottom).toFixed(1)};
      float y = ${AREA.top.toFixed(1)} - mod(uTime * (9.0 + aRand.w * 3.0) + aRand.y * h, h);
      vec3 p = vec3(mix(${AREA.x[0].toFixed(1)}, ${AREA.x[1].toFixed(1)}, aRand.x), y, mix(${AREA.z[0].toFixed(1)}, ${AREA.z[1].toFixed(1)}, aRand.z));
      // Tropfen als kurzer Strich, leicht vom Wind schräg
      p += aEnd * vec3(0.06, 0.42, 0.0);
      float d = distance(p, uCam);
      vA = (0.35 + 0.65 * aRand.w) * smoothstep(1.0, 3.0, d) * (1.0 - smoothstep(14.0, 24.0, d));
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uLevel; varying float vA;
    void main() { gl_FragColor = vec4(uColor * vA * uLevel, 1.0); }
  `,
};

const snowShader = {
  vertexShader: /* glsl */ `
    attribute vec4 aRand;
    uniform float uTime, uPx; uniform vec3 uCam;
    varying float vA;
    void main() {
      float h = ${(AREA.top - AREA.bottom).toFixed(1)};
      float y = ${AREA.top.toFixed(1)} - mod(uTime * (0.6 + aRand.w * 0.5) + aRand.y * h, h);
      // Flocken treiben und taumeln
      float sway = sin(uTime * (0.7 + aRand.w) + aRand.x * 40.0) * 0.35;
      vec3 p = vec3(mix(${AREA.x[0].toFixed(1)}, ${AREA.x[1].toFixed(1)}, aRand.x) + sway, y,
                    mix(${AREA.z[0].toFixed(1)}, ${AREA.z[1].toFixed(1)}, aRand.z) + cos(uTime * 0.5 + aRand.y * 30.0) * 0.2);
      vec4 mv = viewMatrix * vec4(p, 1.0);
      float d = -mv.z;
      vA = smoothstep(0.8, 2.0, d) * (1.0 - smoothstep(16.0, 26.0, d));
      gl_Position = projectionMatrix * mv;
      gl_PointSize = min((0.05 + 0.04 * aRand.w) * uPx / max(d, 0.3), 28.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uLevel; varying float vA;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.15, d) * vA * uLevel;
      if (a < 0.01) discard;
      gl_FragColor = vec4(uColor, a);
    }
  `,
};

function rainGeometry() {
  const r = rng("regen");
  const pos = new Float32Array(RAIN * 2 * 3);
  const rand = new Float32Array(RAIN * 2 * 4);
  const end = new Float32Array(RAIN * 2);
  for (let i = 0; i < RAIN; i++) {
    const v = [r.next(), r.next(), r.next(), r.next()];
    rand.set(v, i * 8);
    rand.set(v, i * 8 + 4);
    end[i * 2 + 1] = 1;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("aRand", new BufferAttribute(rand, 4));
  g.setAttribute("aEnd", new BufferAttribute(end, 1));
  return g;
}

function snowGeometry() {
  const r = rng("schnee");
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(SNOW * 3), 3));
  g.setAttribute(
    "aRand",
    new BufferAttribute(
      Float32Array.from({ length: SNOW * 4 }, () => r.next()),
      4,
    ),
  );
  return g;
}

/** Wetter über Bühne und Publikum; Menge je Qualitätsstufe (`scale`), im Bühnenlicht getönt. */
export function Weather({
  kind,
  frameRef,
  lightsRef,
  scale,
}: {
  kind: NonNullable<WeatherKind>;
  frameRef: React.RefObject<Frame>;
  lightsRef: React.RefObject<LightFrame | null>;
  scale: number;
}) {
  const geometry = useMemo(() => (kind === "regen" ? rainGeometry() : snowGeometry()), [kind]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(
    () => void geometry.setDrawRange(0, Math.round((kind === "regen" ? RAIN * 2 : SNOW) * scale)),
    [geometry, kind, scale],
  );
  const mat = useRef<ShaderMaterial>(null);
  const size = useThree((s) => s.size);
  const gl = useThree((s) => s.gl);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPx: { value: 500 },
      uLevel: { value: 1 },
      uCam: { value: new Vector3() },
      uColor: { value: new Color(kind === "regen" ? "#9fb6d8" : "#f4f7ff") },
    }),
    [kind],
  );
  useFrame(({ camera }) => {
    const u = mat.current?.uniforms;
    if (!u) return;
    u.uTime!.value = frameRef.current.t / 1000;
    (u.uCam!.value as Vector3).copy(camera.position);
    const l = lightsRef.current;
    u.uLevel!.value = (kind === "regen" ? 0.55 : 1) * (1 - 0.6 * (l?.blackout ?? 0));
    const fov = "fov" in camera ? (camera.fov as number) : 36;
    u.uPx!.value = (size.height * gl.getPixelRatio()) / (2 * Math.tan((fov * Math.PI) / 360));
  });
  const shader = kind === "regen" ? rainShader : snowShader;
  return kind === "regen" ? (
    <lineSegments geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        args={[{ ...shader, uniforms }]}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </lineSegments>
  ) : (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        args={[{ ...shader, uniforms }]}
        transparent
        depthWrite={false}
        blending={NormalBlending}
        toneMapped={false}
      />
    </points>
  );
}
