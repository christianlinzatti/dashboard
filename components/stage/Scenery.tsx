"use client";

import { extend, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Line,
  RepeatWrapping,
  Shape,
  SRGBColorSpace,
  Vector3,
  type Group,
  type ShaderMaterial,
} from "three";
import { rng } from "@/lib/dance/rng";
import { songContext } from "@/lib/song-context/store";
import type { Theme } from "@/lib/stage/themes";
import { useShaderArgs } from "./shader-args";

/**
 * `<threeLine>` (THREE.Line; `<line>` wäre das SVG-Element) ausdrücklich registrieren: React Three Fiber findet den
 * Namen beim ersten Anlegen, beim Neuaufbau nach einer Prop-Änderung aber nur über den Katalog („ThreeLine is not part
 * of the THREE namespace“).
 */
extend({ ThreeLine: Line });

const plainVertex = /* glsl */ `
  varying vec2 vUv; varying vec3 vPos;
  void main() { vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/** Himmelskuppel mit Farbverlauf (Abendhimmel, Retro, Weltall mit Nebel). */
export function SkyDome({
  top,
  horizon,
  nebula = 0,
  nebulaColor = horizon,
}: {
  top: string;
  horizon: string;
  nebula?: number;
  nebulaColor?: string;
}) {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new Color(top) },
      uHorizon: { value: new Color(horizon) },
      uNebula: { value: nebula },
      uNebulaColor: { value: new Color(nebulaColor) },
    }),
    [top, horizon, nebula, nebulaColor],
  );
  const shaderArgs1 = useShaderArgs({
    uniforms,
    vertexShader: plainVertex,
    fragmentShader: /* glsl */ `
              uniform vec3 uTop, uHorizon, uNebulaColor; uniform float uNebula; varying vec3 vPos;
              float n(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
              float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
                return mix(mix(n(i), n(i + vec2(1, 0)), f.x), mix(n(i + vec2(0, 1)), n(i + vec2(1, 1)), f.x), f.y); }
              void main() {
                vec3 d = normalize(vPos);
                float h = clamp(d.y * 2.2, 0.0, 1.0);
                vec3 col = mix(uHorizon, uTop, pow(h, 0.6));
                if (uNebula > 0.0) {
                  float m = noise(d.xy * 3.0 + 1.7) * 0.6 + noise(d.xz * 7.0) * 0.4;
                  col += uNebulaColor * smoothstep(0.55, 0.95, m) * uNebula;
                }
                gl_FragColor = vec4(col, 1.0);
              }
            `,
  });
  return (
    <mesh>
      <sphereGeometry args={[60, 32, 16]} />
      <shaderMaterial side={BackSide} depthWrite={false} fog={false} args={shaderArgs1} />
    </mesh>
  );
}

/** Sterne: Punkte auf der oberen Halbkugel, leicht funkelnd. */
export function Stars({ count, size = 0.18 }: { count: number; size?: number }) {
  const geometry = useMemo(() => {
    const r = rng("sterne");
    const pos = new Float32Array(count * 3);
    const tw = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const th = r.next() * Math.PI * 2;
      const y = 0.05 + r.next() * 0.9;
      const rr = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * rr * 50, y * 50 - 4, Math.sin(th) * rr * 50], i * 3);
      tw[i] = r.next();
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("aTw", new BufferAttribute(tw, 1));
    return g;
  }, [count]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const mat = useRef<ShaderMaterial>(null);
  useFrame(() => {
    if (mat.current) mat.current.uniforms.uTime!.value = songContext.getState().positionMs / 1000;
  });
  const starUniforms = useMemo(() => ({ uTime: { value: 0 }, uSize: { value: size } }), [size]);
  const shaderArgs2 = useShaderArgs({
    uniforms: starUniforms,
    vertexShader: /* glsl */ `
              attribute float aTw; uniform float uTime, uSize; varying float vB;
              void main() {
                vB = 0.55 + 0.45 * sin(uTime * (0.8 + aTw * 2.0) + aTw * 40.0);
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mv;
                gl_PointSize = (1.0 + aTw * 2.2) * uSize * 10.0;
              }
            `,
    fragmentShader: /* glsl */ `
              varying float vB;
              void main() { float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vec3(1.0) * smoothstep(0.5, 0.0, d) * vB, 1.0); }
            `,
  });
  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial ref={mat} transparent depthWrite={false} fog={false} blending={AdditiveBlending} args={shaderArgs2} />
    </points>
  );
}

/** Synthwave: gestreifte Retro-Sonne und Bergsilhouette mit Neonkante. */
export function RetroSun({ top, bottom, edge }: { top: string; bottom: string; edge: string }) {
  const uniforms = useMemo(
    () => ({ uTop: { value: new Color(top) }, uBottom: { value: new Color(bottom) }, uTime: { value: 0 } }),
    [top, bottom],
  );
  const mat = useRef<ShaderMaterial>(null);
  useFrame(() => {
    if (mat.current) mat.current.uniforms.uTime!.value = songContext.getState().positionMs / 1000;
  });
  const mountains = useMemo(() => {
    const r = rng("berge");
    const s = new Shape();
    s.moveTo(-30, -1);
    for (let x = -30; x <= 30; x += 2.4) s.lineTo(x, Math.abs(x) < 7 ? 0.2 + r.next() * 0.8 : 1 + r.next() * 3.4);
    s.lineTo(30, -1);
    return s;
  }, []);
  // Neonkante nur entlang der Gipfel (ohne die Grundlinie)
  const ridge = useMemo(
    () =>
      new BufferGeometry().setFromPoints(
        mountains
          .getPoints()
          .slice(1, -1)
          .map((p) => new Vector3(p.x, p.y, 0)),
      ),
    [mountains],
  );
  useEffect(() => () => ridge.dispose(), [ridge]);
  const shaderArgs3 = useShaderArgs({
    uniforms,
    vertexShader: plainVertex,
    fragmentShader: /* glsl */ `
                uniform vec3 uTop, uBottom; uniform float uTime; varying vec2 vUv;
                void main() {
                  float y = vUv.y;
                  vec3 col = mix(uBottom, uTop, smoothstep(0.1, 0.95, y));
                  // waagrechte Lücken in der unteren Hälfte, langsam nach unten wandernd
                  float band = fract(y * 14.0 + uTime * 0.25);
                  float gap = step(y, 0.55) * step(band, 0.35 * (1.0 - y / 0.55));
                  gl_FragColor = vec4(col * 1.25, 1.0 - gap);
                }
              `,
  });
  return (
    <group position={[0, 0, -20]}>
      <mesh position={[0, 3.2, -0.2]}>
        <circleGeometry args={[6.5, 64]} />
        <shaderMaterial ref={mat} fog={false} transparent toneMapped={false} args={shaderArgs3} />
      </mesh>
      <mesh position={[0, -0.6, 0.5]}>
        <shapeGeometry args={[mountains]} />
        <meshBasicMaterial color="#14051f" fog={false} />
      </mesh>
      <threeLine position={[0, -0.6, 0.52]} geometry={ridge}>
        <lineBasicMaterial color={edge} fog={false} toneMapped={false} />
      </threeLine>
    </group>
  );
}

/** Synthwave-Boden: Neonraster, das im Takt auf die Bühne zufährt. */
export function NeonGrid({ color, beatMs }: { color: string; beatMs: number }) {
  const uniforms = useMemo(() => ({ uColor: { value: new Color(color) }, uShift: { value: 0 } }), [color]);
  const mat = useRef<ShaderMaterial>(null);
  useFrame(() => {
    if (mat.current) mat.current.uniforms.uShift!.value = songContext.getState().positionMs / beatMs;
  });
  const shaderArgs4 = useShaderArgs({
    uniforms,
    vertexShader: plainVertex,
    fragmentShader: /* glsl */ `
              uniform vec3 uColor; uniform float uShift; varying vec3 vPos;
              void main() {
                vec2 p = vPos.xy;
                vec2 g = abs(fract(vec2(p.x / 2.0, (p.y + uShift * 2.0) / 2.0) - 0.5));
                float w = 0.03 + 0.002 * length(p);
                float line = max(smoothstep(w, 0.0, abs(g.x - 0.5)), smoothstep(w, 0.0, abs(g.y - 0.5)));
                float fade = smoothstep(40.0, 6.0, length(p));
                gl_FragColor = vec4(uColor * line * fade + vec3(0.04, 0.0, 0.07), 1.0);
              }
            `,
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.26}>
      <planeGeometry args={[80, 80]} />
      <shaderMaterial ref={mat} fog={false} toneMapped={false} args={shaderArgs4} />
    </mesh>
  );
}

/** Theatervorhang (Jazz-Keller): Falten, warmes Oberlicht, leichtes Wogen. */
export function Curtain({ color, z }: { color: string; z: number }) {
  const uniforms = useMemo(() => ({ uColor: { value: new Color(color) }, uTime: { value: 0 } }), [color]);
  const mat = useRef<ShaderMaterial>(null);
  useFrame(() => {
    if (mat.current) mat.current.uniforms.uTime!.value = songContext.getState().positionMs / 1000;
  });
  const shaderArgs5 = useShaderArgs({
    uniforms,
    vertexShader: plainVertex,
    fragmentShader: /* glsl */ `
              uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
              void main() {
                float x = vUv.x * 46.0 + sin(vUv.y * 3.0 + uTime * 0.4) * 0.6;
                float fold = 0.55 + 0.45 * sin(x) * sin(x * 0.5 + 1.3);
                float light = 0.35 + 0.65 * smoothstep(0.0, 0.9, vUv.y) * (1.0 - 0.6 * pow(abs(vUv.x - 0.5) * 2.0, 2.0));
                gl_FragColor = vec4(uColor * fold * light * 0.75, 1.0);
              }
            `,
  });
  return (
    <mesh position={[0, 3.2, z]}>
      <planeGeometry args={[16, 7.4]} />
      <shaderMaterial ref={mat} args={shaderArgs5} />
    </mesh>
  );
}

/** Planet mit Ring und kleinem Mond (Weltraum). */
export function Planet({ color, ring }: { color: string; ring: string }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    if (group.current) group.current.rotation.y = songContext.getState().positionMs / 60_000;
  });
  const uniforms = useMemo(() => ({ uColor: { value: new Color(color) } }), [color]);
  const shaderArgs6 = useShaderArgs({
    uniforms,
    vertexShader: /* glsl */ `
                  varying vec3 vN; varying vec3 vP;
                  void main() { vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
                `,
    fragmentShader: /* glsl */ `
                  uniform vec3 uColor; varying vec3 vN; varying vec3 vP;
                  void main() {
                    float lit = clamp(dot(vN, normalize(vec3(-0.7, 0.4, 0.6))), 0.0, 1.0);
                    float bands = 0.75 + 0.25 * sin(vP.y * 5.0 + sin(vP.x * 1.3) * 1.5);
                    float rim = pow(1.0 - abs(vN.z), 3.0);
                    gl_FragColor = vec4(uColor * bands * (0.08 + 0.92 * lit) + uColor * rim * 0.6, 1.0);
                  }
                `,
  });
  return (
    <group position={[5.5, 3.4, -20]}>
      <group ref={group}>
        <mesh>
          <sphereGeometry args={[3.2, 48, 32]} />
          <shaderMaterial fog={false} args={shaderArgs6} />
        </mesh>
      </group>
      <mesh rotation={[-1.2, 0.25, 0]}>
        <ringGeometry args={[4.1, 6.2, 96]} />
        <meshBasicMaterial color={ring} transparent opacity={0.45} side={DoubleSide} fog={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Bodentextur aus einer Canvas-Zeichnung (Holzdielen, Mondgestein, Bühnenplatten). */
export function useFloorTexture(kind: Theme["floor"]) {
  const tex = useMemo(() => {
    if (kind === "spiegel" || kind === "raster") return null;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const r = rng(`boden-${kind}`);
    if (kind === "holz") {
      for (let i = 0; i < 8; i++) {
        const l = 22 + r.next() * 12;
        g.fillStyle = `hsl(${24 + r.next() * 8}, 55%, ${l}%)`;
        g.fillRect(0, i * 32, 256, 32);
        for (let k = 0; k < 14; k++) {
          g.strokeStyle = `rgba(40,20,8,${0.15 + r.next() * 0.2})`;
          g.beginPath();
          const y = i * 32 + r.next() * 32;
          g.moveTo(0, y);
          g.bezierCurveTo(80, y + r.next() * 6 - 3, 170, y + r.next() * 6 - 3, 256, y);
          g.stroke();
        }
        g.fillStyle = "rgba(0,0,0,0.6)";
        g.fillRect(0, i * 32, 256, 1.5);
        g.fillRect(((i * 97) % 256) | 0, i * 32, 1.5, 32);
      }
    } else if (kind === "mond") {
      g.fillStyle = "#3a3d4a";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 70; i++) {
        const x = r.next() * 256;
        const y = r.next() * 256;
        const rad = 3 + r.next() ** 2 * 26;
        const grad = g.createRadialGradient(x - rad * 0.2, y - rad * 0.2, rad * 0.2, x, y, rad);
        grad.addColorStop(0, "rgba(20,22,30,0.55)");
        grad.addColorStop(0.8, "rgba(20,22,30,0.25)");
        grad.addColorStop(1, "rgba(160,165,185,0.25)");
        g.fillStyle = grad;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === "sand") {
      g.fillStyle = "#b08a5e";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) {
        const l = 45 + r.next() * 30;
        g.fillStyle = `hsla(${30 + r.next() * 10}, 40%, ${l}%, 0.35)`;
        g.fillRect(r.next() * 256, r.next() * 256, 1.5, 1.5);
      }
      // Windrippel
      g.strokeStyle = "rgba(90,60,30,0.18)";
      for (let i = 0; i < 18; i++) {
        g.beginPath();
        const y = i * 14 + r.next() * 6;
        g.moveTo(0, y);
        g.bezierCurveTo(80, y + 6, 170, y - 6, 256, y);
        g.stroke();
      }
    } else if (kind === "beton" || kind === "stein") {
      g.fillStyle = kind === "beton" ? "#3a3938" : "#4a4652";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 1500; i++) {
        const v = 30 + r.next() * 50;
        g.fillStyle = `rgba(${v},${v},${v + (kind === "stein" ? 6 : 0)},${0.1 + r.next() * 0.2})`;
        g.fillRect(r.next() * 256, r.next() * 256, 1 + r.next() * 3, 1 + r.next() * 3);
      }
      // Fugen: Betonplatten groß, Steinplatten im Verband
      g.fillStyle = "rgba(0,0,0,0.45)";
      const n = kind === "beton" ? 2 : 4;
      for (let i = 0; i < n; i++) {
        g.fillRect(0, (i * 256) / n, 256, 2);
        for (let k = 0; k < n; k++) g.fillRect(((k + (i % 2) * 0.5) * 256) / n, (i * 256) / n, 2, 256 / n);
      }
    } else {
      g.fillStyle = "#16161c";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 4; i++)
        for (let k = 0; k < 4; k++) {
          g.fillStyle = `rgba(255,255,255,${0.02 + r.next() * 0.03})`;
          g.fillRect(i * 64 + 1, k * 64 + 1, 62, 62);
        }
    }
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(kind === "holz" ? 6 : kind === "sand" ? 14 : 8, kind === "holz" ? 10 : kind === "sand" ? 14 : 8);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [kind]);
  useEffect(() => () => tex?.dispose(), [tex]);
  return tex;
}
