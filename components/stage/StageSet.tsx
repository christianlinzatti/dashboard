"use client";

import { useFrame } from "@react-three/fiber";
import { MeshReflectorMaterial } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, type Mesh, type ShaderMaterial } from "three";
import type { LightFrame } from "@/lib/stage/lights";
import type { QualityPreset } from "@/lib/stage/quality";
import type { Theme } from "@/lib/stage/themes";
import { Curtain, NeonGrid, Planet, RetroSun, SkyDome, Stars, useFloorTexture } from "./Scenery";
import { songContext } from "@/lib/song-context/store";

export const TRUSS_Y = 4.3;
export const TRUSS_Z = -2.6;

/** Podest, Boden, Traverse, Rückwand und Himmel – je nach Bühnen-Thema. */
export function StageSet({
  preset,
  dark,
  accent,
  theme,
  beatMs,
  lightsRef,
}: {
  preset: QualityPreset;
  dark: string;
  accent: string;
  theme: Theme;
  beatMs: number;
  lightsRef: React.RefObject<LightFrame | null>;
}) {
  const floorTex = useFloorTexture(theme.floor);
  return (
    <group>
      <Sky theme={theme} accent={accent} />
      {/* Boden */}
      {theme.floor === "raster" ? (
        <NeonGrid color={theme.colors.dominant} beatMs={beatMs} />
      ) : (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.26}>
          <planeGeometry args={[60, 60]} />
          {theme.floor === "spiegel" && preset.reflector ? (
            <MeshReflectorMaterial
              color={dark}
              resolution={512}
              mixBlur={1}
              mixStrength={2.5}
              blur={[300, 80]}
              roughness={0.8}
              metalness={0.4}
              mirror={0}
            />
          ) : floorTex ? (
            <meshStandardMaterial map={floorTex} roughness={theme.floor === "holz" ? 0.45 : 0.9} metalness={0.1} />
          ) : (
            <meshStandardMaterial color={dark} roughness={0.6} metalness={0.2} />
          )}
        </mesh>
      )}
      {/* Podest */}
      <mesh position-y={-0.13}>
        <cylinderGeometry args={[4.3, 4.45, 0.26, 64]} />
        <meshStandardMaterial color={dark} roughness={0.35} metalness={0.5} />
      </mesh>
      <mesh position-y={0.001} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[4.22, 4.3, 64]} />
        <meshBasicMaterial
          color={theme.floor === "raster" ? theme.colors.accent : "#ffffff"}
          transparent
          opacity={theme.floor === "raster" ? 0.8 : 0.25}
          toneMapped={false}
        />
      </mesh>
      {theme.truss === "club" && <Truss />}
      {theme.truss === "dach" && <FestivalRoof />}
      {theme.wall === "led" && (
        <WallFrame scale={wallScale(theme)}>
          <LedWall lightsRef={lightsRef} />
        </WallFrame>
      )}
      {theme.wall === "sonne" && <RetroSun top="#ffd84a" bottom={theme.colors.accent} edge={theme.colors.dominant} />}
      {theme.wall === "vorhang" && <Curtain color={theme.colors.dominant} z={TRUSS_Z - 0.6} />}
      {theme.wall === "planet" && <Planet color={accent} ring={theme.colors.accent} />}
    </group>
  );
}

/** Himmel hinter der Bühne (nur Open-Air-artige Themen). */
function Sky({ theme, accent }: { theme: Theme; accent: string }) {
  switch (theme.sky) {
    case "abend":
      return (
        <>
          <SkyDome top="#0b1238" horizon="#ff7a45" />
          <Stars count={80} size={0.14} />
        </>
      );
    case "retro":
      return (
        <>
          <SkyDome top="#0d0220" horizon="#7a1a8c" />
          <Stars count={160} size={0.14} />
        </>
      );
    case "sterne":
      return (
        <>
          <SkyDome top="#010208" horizon="#140f38" nebula={0.35} nebulaColor={accent} />
          <Stars count={600} />
        </>
      );
    default:
      return null;
  }
}

/** Festival: Bühnendach auf zwei Türmen, PA-Boxen links und rechts. */
function FestivalRoof() {
  const steel = <meshStandardMaterial color="#3a3a44" metalness={0.8} roughness={0.35} />;
  const box = <meshStandardMaterial color="#111116" roughness={0.7} />;
  return (
    <group position={[0, 0, TRUSS_Z]}>
      {[-5.6, 5.6].map((x) => (
        <group key={x}>
          {[-0.35, 0.35].map((dz) => (
            <mesh key={dz} position={[x, 2.9, dz]}>
              <boxGeometry args={[0.16, 5.8, 0.16]} />
              {steel}
            </mesh>
          ))}
          {/* PA-Line-Array: leicht gebogen */}
          {[0, 1, 2, 3, 4].map((i) => (
            <mesh key={i} position={[x * 0.86, 3.7 - i * 0.3, 0.9 + i * 0.03]} rotation-x={i * 0.05}>
              <boxGeometry args={[0.6, 0.27, 0.4]} />
              {box}
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 5.4, 0]}>
        <boxGeometry args={[12, 0.3, 0.9]} />
        {steel}
      </mesh>
      <mesh position={[0, TRUSS_Y, 0.25]}>
        <boxGeometry args={[11, 0.16, 0.16]} />
        {steel}
      </mesh>
    </group>
  );
}

function Truss() {
  const mat = <meshStandardMaterial color="#2a2a33" metalness={0.8} roughness={0.35} />;
  return (
    <group position={[0, 0, TRUSS_Z]}>
      {[-5.2, 5.2].map((x) => (
        <mesh key={x} position={[x, TRUSS_Y / 2, 0]}>
          <boxGeometry args={[0.18, TRUSS_Y + 0.3, 0.18]} />
          {mat}
        </mesh>
      ))}
      <mesh position={[0, TRUSS_Y, 0]}>
        <boxGeometry args={[10.6, 0.18, 0.18]} />
        {mat}
      </mesh>
    </group>
  );
}

const wallShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime; uniform vec3 uA; uniform vec3 uB; uniform float uLevel; uniform float uMode; uniform float uBands[6];
    varying vec2 vUv;
    void main() {
      // LED-Raster
      vec2 grid = fract(vUv * vec2(96.0, 48.0));
      float led = smoothstep(0.0, 0.25, grid.x) * smoothstep(1.0, 0.75, grid.x) * smoothstep(0.0, 0.25, grid.y) * smoothstep(1.0, 0.75, grid.y);
      vec3 col;
      if (uMode < 0.5) {
        // ruhiger Farbverlauf, langsam wandernd
        float w = 0.5 + 0.5 * sin(vUv.x * 3.0 + uTime * 0.3 + vUv.y * 2.0);
        col = mix(uA, uB, w) * (0.2 + 0.3 * uLevel);
      } else if (uMode < 1.5) {
        // Equalizer-Balken aus den Frequenzbändern
        float x = vUv.x * 12.0;
        int i = int(mod(abs(floor(x) - 5.5), 6.0));
        float h = 0.0;
        for (int k = 0; k < 6; k++) if (k == i) h = uBands[k];
        h = clamp(h * (0.4 + uLevel), 0.05, 0.98);
        float bar = step(vUv.y, h) * step(0.08, fract(x));
        col = mix(uA, uB, vUv.y) * (0.15 + bar * (0.6 + 0.4 * uLevel));
      } else {
        // Gegenlicht: heller Rand unten
        col = uB * (0.1 + 0.6 * pow(1.0 - vUv.y, 3.0)) * (0.4 + uLevel);
      }
      // Wand bleibt Hintergrund: gedämpft, damit Avatare und Lyrics vorne bleiben
      gl_FragColor = vec4(col * (0.25 + 0.75 * led) * 0.45, 1.0);
    }
  `,
};

function LedWall({ lightsRef }: { lightsRef: React.RefObject<LightFrame | null> }) {
  const mat = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uA: { value: new Color("#7b2cff") },
      uB: { value: new Color("#ff4fd8") },
      uLevel: { value: 0.5 },
      uMode: { value: 0 },
      uBands: { value: [0.4, 0.5, 0.4, 0.35, 0.3, 0.2] },
    }),
    [],
  );
  useFrame(() => {
    const f = lightsRef.current;
    const m = mat.current;
    if (!f || !m) return;
    const { positionMs, live } = songContext.getState();
    m.uniforms.uTime!.value = positionMs / 1000;
    (m.uniforms.uA!.value as Color).set(f.wall.colorA);
    (m.uniforms.uB!.value as Color).set(f.wall.colorB);
    m.uniforms.uLevel!.value = f.wall.level;
    m.uniforms.uMode!.value = f.wall.mode;
    if (live.micActive && live.bands.length === 6) m.uniforms.uBands!.value = live.bands;
    else {
      // ohne Mikro: ruhige, deterministische Balken aus der Songzeit
      const t = positionMs / 1000;
      m.uniforms.uBands!.value = [0, 1, 2, 3, 4, 5].map((i) => 0.35 + 0.25 * Math.sin(t * (1.3 + i * 0.4) + i));
    }
  });
  return (
    <mesh position={[0, 2.3, TRUSS_Z - 0.5]}>
      <planeGeometry args={[10, 4.4]} />
      <shaderMaterial ref={mat} args={[{ ...wallShader, uniforms }]} toneMapped={false} />
    </mesh>
  );
}

/** Weicher Bodennebel: wenige große, additive Schichten mit Rauschtextur. */
export function Fog({ lightsRef, color }: { lightsRef: React.RefObject<LightFrame | null>; color: string }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    let s = 1;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) {
      const x = rnd() * 128;
      const y = 40 + rnd() * 50;
      const r = 20 + rnd() * 40;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, "rgba(255,255,255,0.18)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    }
    return new CanvasTexture(c);
  }, []);
  const layers = useRef<Array<Mesh | null>>([]);
  useFrame(() => {
    const f = lightsRef.current;
    const t = songContext.getState().positionMs / 1000;
    layers.current.forEach((m, i) => {
      if (!m) return;
      m.position.x = Math.sin(t * 0.05 + i * 2) * 1.5;
      (m.material as { opacity: number }).opacity = (f?.fog ?? 0.5) * 0.12;
    });
  });
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => void (layers.current[i] = m)} position={[0, 0.15 + i * 0.08, -0.5 - i * 1.4]}>
          <planeGeometry args={[14, 1.2]} />
          <meshBasicMaterial
            map={tex}
            color={color}
            transparent
            opacity={0.2}
            depthWrite={false}
            blending={AdditiveBlending}
            side={DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Skaliert LED-Wand-Inhalte (LED-Wand, Foto, Logo) um die Wandmitte – Festival hat eine kleinere Wand mit Himmel drumherum. */
const WALL_CENTER: [number, number, number] = [0, 2.3, TRUSS_Z - 0.5];
export function WallFrame({ scale, children }: { scale: number; children: React.ReactNode }) {
  const [x, y, z] = WALL_CENTER;
  return (
    <group position={[x * (1 - scale), y * (1 - scale) - (1 - scale) * 1.2, z * (1 - scale)]} scale={scale}>
      {children}
    </group>
  );
}

export const wallScale = (theme: Theme) => (theme.id === "festival" ? 0.74 : 1);
