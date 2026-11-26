"use client";

import { useFBO } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  Color,
  PerspectiveCamera,
  type Group,
  type Scene,
  type ShaderMaterial,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from "three";
import type { Choreography } from "@/lib/dance/plan";
import { liveShotAt, SCREEN_ASPECT, screenEvery, screenThrottle, type LiveShot } from "@/lib/stage/screens";
import { perf } from "@/lib/stage/perf";
import { songContext } from "@/lib/song-context/store";
import type { LightFrame } from "@/lib/stage/lights";
import { TRUSS_Z } from "./layout";
import type { Frame } from "./types";
import { useShaderArgs } from "./shader-args";

/** Zwei Bildschirme links und rechts auf der LED-Wand (in Wand-Koordinaten, skaliert mit der Wand) */
const SCREENS: Array<[number, number]> = [
  [-3.85, 2.55],
  [3.85, 2.55],
];
const SCREEN_W = 2.2;

const screenShader = {
  vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D uFeed; uniform float uLevel; uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(uFeed, vUv).rgb;
      // LED-Raster: feine Pixel mit dunklen Fugen, leicht angehobenes Schwarz wie bei echten Bildschirmen
      vec2 g = fract(vUv * vec2(192.0, 108.0));
      float led = smoothstep(0.0, 0.2, g.x) * smoothstep(1.0, 0.8, g.x) * smoothstep(0.0, 0.2, g.y) * smoothstep(1.0, 0.8, g.y);
      c = c * 1.15 + 0.035 + uTint * 0.03;
      vec2 e = vUv - 0.5;
      float vignette = 1.0 - dot(e, e) * 0.6;
      gl_FragColor = vec4(c * (0.45 + 0.55 * led) * vignette * uLevel, 1.0);
    }
  `,
};

/** Eine Einstellung ins Render-Target filmen; die Bildschirme dabei ausblenden (sonst Bild im Bild im Bild …) */
function film(gl: WebGLRenderer, scene: Scene, cam: PerspectiveCamera, fbo: WebGLRenderTarget, screens: Group, shot: LiveShot) {
  cam.position.set(...shot.pos);
  if (cam.fov !== shot.fov) {
    cam.fov = shot.fov;
    cam.updateProjectionMatrix();
  }
  cam.lookAt(...shot.target);
  screens.visible = false;
  const prev = gl.getRenderTarget();
  gl.setRenderTarget(fbo);
  gl.clear();
  gl.render(scene, cam);
  gl.setRenderTarget(prev);
  screens.visible = true;
}

/**
 * Live-Bildschirme wie bei großen Konzerten: eine zweite Kamera filmt die Show (Nahaufnahme des Sängers, die Crew,
 * das Publikum von der Bühne aus) und das Bild läuft auf zwei Bildschirmen an der LED-Wand. Die Einstellung wechselt
 * nach einem festen Plan aus der Songzeit (lib/stage/screens.ts). `every` = jedes wievielte Bild neu gefilmt wird.
 */
export function LiveScreens({
  choreo,
  frameRef,
  lightsRef,
  accent,
  width,
  every,
}: {
  choreo: Choreography;
  frameRef: React.RefObject<Frame>;
  lightsRef: React.RefObject<LightFrame | null>;
  accent: string;
  width: number;
  every: number;
}) {
  const height = Math.round(width / SCREEN_ASPECT);
  const fbo = useFBO(width, height);
  const cam = useMemo(() => new PerspectiveCamera(28, SCREEN_ASPECT, 0.1, 80), []);
  const group = useRef<Group>(null);
  const mat = useRef<ShaderMaterial>(null);
  const count = useRef(0);
  const throttle = useRef(0);
  const uniforms = useMemo(
    () => ({ uFeed: { value: fbo.texture }, uLevel: { value: 1 }, uTint: { value: new Color(accent) } }),
    [fbo, accent],
  );

  useFrame(({ gl, scene }) => {
    const f = frameRef.current;
    const g = group.current;
    if (!g) return;
    const lf = lightsRef.current;
    const u = mat.current?.uniforms;
    if (u) u.uLevel!.value = 1 - 0.85 * (lf?.blackout ?? 0);
    // Erst filmen, wenn die Regie (Director) den Frame gefüllt hat – sonst hinge bei angehaltener Szene (es werden
    // nur wenige Bilder gerendert) ein Bild vom Songanfang auf den Schirmen, je nach Reihenfolge der Komponenten.
    if (!f.focus) return;
    // knappe Bildrate: seltener filmen (Stufe aus der gemessenen Bildrate, alle 2 s neu)
    throttle.current = screenThrottle(perf.getState().fps, throttle.current);
    // angehalten: jedes Bild filmen (es gibt nur wenige), damit das letzte sicher zum Stand passt
    if (count.current++ % screenEvery(every, throttle.current) !== 0 && !songContext.getState().frozen) return;
    const focus = f.positions[f.focus];
    const shot = liveShotAt(choreo, f.t, focus);
    film(gl, scene, cam, fbo, g, shot);
    if (gl.domElement.dataset.screen !== shot.name) gl.domElement.dataset.screen = shot.name;
  });

  const screenArgs = useShaderArgs({ ...screenShader, uniforms });
  return (
    <group ref={group}>
      {SCREENS.map(([x, y]) => (
        <group key={x} position={[x, y, TRUSS_Z - 0.42]}>
          {/* Rahmen */}
          <mesh position-z={-0.03}>
            <boxGeometry args={[SCREEN_W + 0.12, SCREEN_W / SCREEN_ASPECT + 0.12, 0.05]} />
            <meshStandardMaterial color="#0c0c10" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh>
            <planeGeometry args={[SCREEN_W, SCREEN_W / SCREEN_ASPECT]} />
            <shaderMaterial ref={x < 0 ? mat : undefined} args={screenArgs} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
