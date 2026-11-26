"use client";

import { useFrame } from "@react-three/fiber";
import { MeshReflectorMaterial } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CanvasTexture, Color, DoubleSide, type Group, type Mesh, type ShaderMaterial } from "three";
import type { LightFrame } from "@/lib/stage/lights";
import type { QualityPreset } from "@/lib/stage/quality";
import type { Theme } from "@/lib/stage/themes";
import type { Frame } from "./types";
import { Curtain, NeonGrid, Planet, RetroSun, SkyDome, Stars, useFloorTexture } from "./Scenery";
import { Beach, Cathedral, Stadium, StadiumRoof, Warehouse } from "./venues";
import { songContext, useSongContext } from "@/lib/song-context/store";
import { chorusKeyword, forcedWallPattern, keywordAmount, wallPattern, wallPatterns } from "@/lib/stage/wall";

import { Instances, mat } from "./instances";
import { NOT_ON_SCREENS, TRUSS_Y, TRUSS_Z } from "./layout";
import { OUTDOOR_SKIES, SKY_BY_PHASE, type DayPhase } from "@/lib/stage/daylight";

export { TRUSS_Y, TRUSS_Z };

/** Podest, Boden, Traverse, Rückwand und Himmel – je nach Bühnen-Thema. */
export function StageSet({
  preset,
  dark,
  accent,
  theme,
  beatMs,
  lightsRef,
  daylight,
  reflectorResolution = 512,
}: {
  preset: QualityPreset;
  /** Auflösung der Bodenspiegelung (kleiner, wenn die Grafik knapp ist) */
  reflectorResolution?: number;
  dark: string;
  accent: string;
  theme: Theme;
  beatMs: number;
  lightsRef: React.RefObject<LightFrame | null>;
  /** Tageszeit (Freiluftbühnen); ohne: der gestaltete Himmel */
  daylight?: DayPhase;
}) {
  const floorTex = useFloorTexture(theme.floor);
  return (
    <group>
      <Sky theme={theme} accent={accent} daylight={daylight} />
      {/* Boden */}
      {theme.floor === "raster" ? (
        <NeonGrid color={theme.colors.dominant} beatMs={beatMs} />
      ) : (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.26}>
          <planeGeometry args={[60, 60]} />
          {theme.floor === "spiegel" && preset.reflector ? (
            <MeshReflectorMaterial
              color={dark}
              resolution={reflectorResolution}
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
      <MonitorWedges />
      {theme.truss === "club" && <Truss />}
      {theme.truss === "dach" && <FestivalRoof />}
      {theme.truss === "stadion" && (
        <>
          <StadiumRoof />
          <Stadium accent={accent} lightsRef={lightsRef} />
        </>
      )}
      {theme.wall === "meer" && <Beach accent={theme.colors.accent} lightsRef={lightsRef} daylight={daylight} />}
      {theme.wall === "beton" && <Warehouse accent={theme.colors.accent} lightsRef={lightsRef} />}
      {theme.wall === "kirche" && <Cathedral accent={theme.colors.accent} lightsRef={lightsRef} />}
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
function Sky({ theme, accent, daylight }: { theme: Theme; accent: string; daylight?: DayPhase }) {
  // Freiluftbühnen folgen der Tageszeit; am Abend bleibt der gestaltete Himmel der Bühne
  if (daylight && daylight !== "abend" && (OUTDOOR_SKIES as readonly string[]).includes(theme.sky)) {
    const look = SKY_BY_PHASE[daylight];
    return (
      <>
        <SkyDome top={look.top} horizon={look.horizon} />
        {look.stars > 0 && <Stars count={look.stars} size={0.12} />}
      </>
    );
  }
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
    case "nacht":
      return (
        <>
          <SkyDome top="#020309" horizon="#151b36" />
          <Stars count={120} size={0.12} />
        </>
      );
    case "strand":
      return (
        <>
          <SkyDome top="#2a1f5c" horizon="#ff7a4a" />
          <Stars count={30} size={0.12} />
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

const FESTIVAL_TOWERS = [-5.6, 5.6];
const FESTIVAL_LEGS = FESTIVAL_TOWERS.flatMap((x) => [-0.35, 0.35].map((dz) => mat({ p: [x, 2.9, dz] })));
/** PA-Line-Array je Turm: fünf Boxen, leicht gebogen */
const FESTIVAL_PA = FESTIVAL_TOWERS.flatMap((x) =>
  [0, 1, 2, 3, 4].map((i) => mat({ p: [x * 0.86, 3.7 - i * 0.3, 0.9 + i * 0.03], r: [i * 0.05, 0, 0] })),
);

/** Festival: Bühnendach auf zwei Türmen, PA-Boxen links und rechts. */
function FestivalRoof() {
  const steel = <meshStandardMaterial color="#3a3a44" metalness={0.8} roughness={0.35} />;
  return (
    <group position={[0, 0, TRUSS_Z]}>
      <Instances matrices={FESTIVAL_LEGS}>
        <boxGeometry args={[0.16, 5.8, 0.16]} />
        {steel}
      </Instances>
      <Instances matrices={FESTIVAL_PA}>
        <boxGeometry args={[0.6, 0.27, 0.4]} />
        <meshStandardMaterial color="#111116" roughness={0.7} />
      </Instances>
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
    uniform float uPattern; uniform float uBeat; uniform sampler2D uWord; uniform float uWordAmt;
    varying vec2 vUv;
    float band(float x) {
      int i = int(mod(abs(floor(x) - 5.5), 6.0));
      float h = 0.0;
      for (int k = 0; k < 6; k++) if (k == i) h = uBands[k];
      return h;
    }
    void main() {
      // LED-Raster
      vec2 grid = fract(vUv * vec2(96.0, 48.0));
      float led = smoothstep(0.0, 0.25, grid.x) * smoothstep(1.0, 0.75, grid.x) * smoothstep(0.0, 0.25, grid.y) * smoothstep(1.0, 0.75, grid.y);
      // Seitenverhältnis der Wand (10 × 4,4): Kreise bleiben rund
      vec2 p = (vUv - 0.5) * vec2(2.27, 1.0);
      float bass = 0.5 * (uBands[0] + uBands[1]);
      vec3 col;
      if (uMode < 0.5) {
        // ruhiger Farbverlauf, langsam wandernd
        float w = 0.5 + 0.5 * sin(vUv.x * 3.0 + uTime * 0.3 + vUv.y * 2.0);
        col = mix(uA, uB, w) * (0.2 + 0.3 * uLevel);
      } else if (uMode < 1.5) {
        if (uPattern < 0.5) {
          // Equalizer-Balken aus den Frequenzbändern
          float x = vUv.x * 12.0;
          float h = clamp(band(x) * (0.4 + uLevel), 0.05, 0.98);
          float bar = step(vUv.y, h) * step(0.08, fract(x));
          col = mix(uA, uB, vUv.y) * (0.15 + bar * (0.6 + 0.4 * uLevel));
        } else if (uPattern < 1.5) {
          // Tunnel: Ringe fliegen im Takt auf das Publikum zu
          float r = length(p);
          float a = atan(p.y, p.x);
          float depth = 0.35 / max(r, 0.04) + uTime * 1.6 + uBeat * 0.5;
          float ring = smoothstep(0.35, 0.5, abs(fract(depth) - 0.5) * 2.0);
          float spokes = 0.5 + 0.5 * sin(a * 8.0 + uTime * 0.7);
          col = mix(uA, uB, fract(depth * 0.25)) * ring * (0.35 + 0.65 * spokes) * (0.4 + 0.8 * uLevel + bass) * smoothstep(0.02, 0.3, r);
        } else if (uPattern < 2.5) {
          // Plasma: weiche, fließende Farbflächen, der Bass treibt das Tempo
          float t = uTime * (0.6 + 0.6 * bass);
          float v = sin(p.x * 4.0 + t) + sin(p.y * 5.0 - t * 1.3) + sin((p.x + p.y) * 3.0 + t * 0.7) + sin(length(p * 4.0) - t * 1.6);
          float w = 0.5 + 0.5 * sin(v * 1.6);
          float glow = smoothstep(0.55, 1.0, w);
          col = mix(uA * 0.5, uB, w) * (0.3 + 0.7 * uLevel) * (0.5 + 1.1 * glow);
        } else {
          // Wellen: Linien wie Lautstärke-Kurven, die Höhen zittern
          float k = 0.0;
          for (int j = 0; j < 4; j++) {
            float fj = float(j);
            float y = 0.5 + (0.12 + 0.1 * band(fj * 3.0)) * sin(vUv.x * (5.0 + fj * 2.0) + uTime * (1.4 + fj * 0.5) + fj * 1.7);
            k += smoothstep(0.035, 0.0, abs(vUv.y - y - (fj - 1.5) * 0.12));
          }
          col = mix(uA, uB, vUv.x) * (0.12 + min(k, 1.2) * (0.6 + 0.5 * uLevel));
        }
      } else {
        // Gegenlicht: heller Rand unten
        col = uB * (0.1 + 0.6 * pow(1.0 - vUv.y, 3.0)) * (0.4 + uLevel);
      }
      // Schlagwort des Refrains groß und hell darüber (Maske aus dem Schrift-Canvas)
      float word = texture2D(uWord, vUv).r * uWordAmt;
      col = mix(col, mix(uB, vec3(1.0), 0.35) * (1.05 + 0.45 * uBeat), word * 0.85);
      // Wand bleibt Hintergrund: gedämpft, damit Avatare und Lyrics vorne bleiben
      gl_FragColor = vec4(col * (0.25 + 0.75 * led) * 0.45, 1.0);
    }
  `,
};

/** Schlagwort als Maske (weiß auf schwarz) für die LED-Wand */
function wordTexture(word: string | null): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 450;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  if (word) {
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    // so groß wie möglich, aber mit Rand
    // die Wand ist breiter als das Bild – das Wort bleibt in der Mitte, die auf jedem Bildschirm zu sehen ist
    let size = 190;
    g.font = `900 ${size}px system-ui, sans-serif`;
    const w = g.measureText(word).width;
    if (w > c.width * 0.56) size = Math.floor((size * c.width * 0.56) / w);
    g.font = `900 ${size}px system-ui, sans-serif`;
    g.fillText(word, c.width / 2, c.height / 2);
  }
  return new CanvasTexture(c);
}

/** Wechselt mit dem Song: Muster nach Genre und Schlagwort des Refrains */
function useWallContent() {
  const song = useSongContext((s) => s.song);
  const pattern = forcedWallPattern() ?? (song ? wallPattern(song) : "equalizer");
  const keyword = useMemo(() => chorusKeyword(song?.lyrics), [song?.lyrics]);
  return { pattern: wallPatterns.indexOf(pattern), keyword };
}

function LedWall({ lightsRef }: { lightsRef: React.RefObject<LightFrame | null> }) {
  const mat = useRef<ShaderMaterial>(null);
  const { pattern, keyword } = useWallContent();
  const tex = useMemo(() => wordTexture(keyword), [keyword]);
  useEffect(() => () => tex.dispose(), [tex]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uA: { value: new Color("#7b2cff") },
      uB: { value: new Color("#ff4fd8") },
      uLevel: { value: 0.5 },
      uMode: { value: 0 },
      uBands: { value: [0.4, 0.5, 0.4, 0.35, 0.3, 0.2] },
      uPattern: { value: 0 },
      uBeat: { value: 0 },
      uWord: { value: null as CanvasTexture | null },
      uWordAmt: { value: 0 },
    }),
    [],
  );
  useFrame(() => {
    const f = lightsRef.current;
    const m = mat.current;
    if (!f || !m) return;
    const { positionMs, live, derived } = songContext.getState();
    const t = positionMs / 1000;
    m.uniforms.uTime!.value = t;
    (m.uniforms.uA!.value as Color).set(f.wall.colorA);
    (m.uniforms.uB!.value as Color).set(f.wall.colorB);
    m.uniforms.uLevel!.value = f.wall.level;
    m.uniforms.uMode!.value = f.wall.mode;
    m.uniforms.uPattern!.value = pattern;
    m.uniforms.uWord!.value = tex;
    // Takt-Puls (fällt nach jedem Schlag ab)
    const beatMs = 60_000 / (live.bpm || 120);
    m.uniforms.uBeat!.value = Math.pow(1 - (positionMs % beatMs) / beatMs, 3);
    // Schlagwort nur im Refrain, im Wechsel mit dem Muster (Blende rein aus der Songzeit)
    m.uniforms.uWordAmt!.value = keyword && f.wall.mode === 1 ? keywordAmount(positionMs, live.bpm, derived.isChorus) : 0;
    if (live.micActive && live.bands.length === 6) m.uniforms.uBands!.value = live.bands;
    // ohne Mikro: ruhige, deterministische Balken aus der Songzeit
    else m.uniforms.uBands!.value = [0, 1, 2, 3, 4, 5].map((i) => 0.35 + 0.25 * Math.sin(t * (1.3 + i * 0.4) + i));
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
        <mesh
          key={i}
          ref={(m) => {
            layers.current[i] = m;
            // Dunstschleier: auf den kleinen Live-Bildschirmen kaum zu sehen – dort nicht mitgefilmt
            m?.layers.set(NOT_ON_SCREENS);
          }}
          position={[0, 0.15 + i * 0.08, -0.5 - i * 1.4]}
        >
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

const MARKS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  return { long: i % 4 === 0, m: mat({ p: [Math.sin(a) * 4.02, 0, Math.cos(a) * 4.02], r: [-Math.PI / 2, 0, -a] }) };
});
const LONG_MARKS = MARKS.filter((k) => k.long).map((k) => k.m);
const SHORT_MARKS = MARKS.filter((k) => !k.long).map((k) => k.m);

/** Leuchtmarken am Podestrand – drehen sich mit der Drehbühne (sonst sähe man die Drehung kaum). */
export function TurntableMarks({ frameRef, color }: { frameRef: React.RefObject<Frame>; color: string }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    if (group.current) group.current.rotation.y = frameRef.current.stageAngle;
  });
  return (
    <group ref={group} position-y={0.006}>
      <Instances matrices={LONG_MARKS}>
        <planeGeometry args={[0.07, 0.32]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.95} />
      </Instances>
      <Instances matrices={SHORT_MARKS}>
        <planeGeometry args={[0.07, 0.16]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.55} />
      </Instances>
    </group>
  );
}

/** Monitorboxen (Wedges) an der Bühnenkante, schräg zu den Künstlern; die Mitte bleibt frei für die Untersicht. */
const WEDGE_ANGLES = [-0.9, -0.45, 0.45, 0.9];
const wedge = (a: number) => ({ p: [Math.sin(a) * 3.85, 0, Math.cos(a) * 3.85], r: [0, a + Math.PI, 0] }) as const;
/** Gehäuse: nach hinten gekippt, Front zu den Tänzern */
const WEDGE_BOXES = WEDGE_ANGLES.map((a) => mat(wedge(a), { p: [0, 0.17, 0], r: [-0.55, 0, 0] }));
/** Lautsprechergitter auf der Front (Front zeigt schräg nach oben zu den Tänzern) */
const WEDGE_GRILLS = WEDGE_ANGLES.map((a) => mat(wedge(a), { p: [0, 0.17 + 0.52 * 0.212, 0.85 * 0.212], r: [-0.55, 0, 0] }));

export function MonitorWedges() {
  return (
    <group>
      <Instances matrices={WEDGE_BOXES}>
        <boxGeometry args={[0.62, 0.36, 0.42]} />
        <meshStandardMaterial color="#121216" metalness={0.3} roughness={0.7} />
      </Instances>
      <Instances matrices={WEDGE_GRILLS}>
        <planeGeometry args={[0.54, 0.3]} />
        <meshStandardMaterial color="#2a2a30" metalness={0.6} roughness={0.5} />
      </Instances>
    </group>
  );
}
