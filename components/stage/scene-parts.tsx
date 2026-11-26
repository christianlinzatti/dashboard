"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { use, useEffect, useRef, useState } from "react";
import { HalfFloatType, WebGLRenderTarget } from "three";
import { loadMixamo } from "@/lib/dance/mixamo-loader";
import { dayPhaseAt, type DayPhase } from "@/lib/stage/daylight";
import { fpsFrom, perf } from "@/lib/stage/perf";
import type { Quality } from "@/lib/stage/quality";

/** Kleine Bausteine der 3D-Bühne (WebGL-Prüfung, Bildrate, Mixamo-Laden, Tageszeit) */

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Bildschirmbreite in Gerätepixeln (für die Größe des Wandfotos) */
export const screenWidth = () =>
  typeof window === "undefined" ? 1280 : window.innerWidth * Math.min(2, window.devicePixelRatio || 1);

/** Misst die Bildrate (alle 2 s) für Debug-Panel und Leistungsproben. */
export function FpsMeter({ quality, resolution }: { quality: Quality; resolution: number }) {
  const times = useRef<number[]>([]);
  const last = useRef(0);
  useFrame((state, dt) => {
    times.current.push(dt);
    if (state.clock.elapsedTime - last.current < 2) return;
    last.current = state.clock.elapsedTime;
    perf.setState({ fps: fpsFrom(times.current), quality, resolution });
    times.current = [];
  });
  return null;
}

/** Wartezeit nach dem Einhängen: bis dahin sind Modelle und Effekte da, und das erste Bild ist gezeichnet */
const WARMUP_DELAY_MS = 1200;

/**
 * Übersetzt alle Shader der Szene im Hintergrund, auch die der noch unsichtbaren Teile (Konfetti, Feuerwerk, Pyro,
 * Luftschlangen …). Sonst übersetzt der Browser sie erst beim ersten Einsatz – mitten im Drop steht das Bild dann
 * für einen Moment (auf Notebooks und dem Pi 50–500 ms je Shader). Mit KHR_parallel_shader_compile blockiert das nicht.
 *
 * Wohin gezeichnet wird, gehört zum Shader (three.js: Farbraum und Tonwertkorrektur): mit Bloom zeichnet die Bühne
 * in einen Zwischenpuffer, die Live-Bildschirme in ihren eigenen – vorbereitet wird genau die Variante, die gebraucht
 * wird, sonst wäre die Arbeit umsonst.
 */
export function ShaderWarmup({ token, screen, buffer }: { token: string; screen: boolean; buffer: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const id = setTimeout(() => {
      const target = gl.getRenderTarget();
      const temp = buffer ? new WebGLRenderTarget(4, 4, { type: HalfFloatType }) : null;
      const jobs: Array<Promise<unknown>> = [];
      try {
        if (screen) {
          gl.setRenderTarget(null);
          jobs.push(gl.compileAsync(scene, camera));
        }
        if (temp) {
          gl.setRenderTarget(temp);
          jobs.push(gl.compileAsync(scene, camera));
        }
      } finally {
        gl.setRenderTarget(target);
      }
      void Promise.all(jobs)
        .then(() => (gl.domElement.dataset.warmup = token))
        .catch(() => undefined)
        .finally(() => temp?.dispose());
    }, WARMUP_DELAY_MS);
    return () => clearTimeout(id);
  }, [gl, scene, camera, token, screen, buffer]);
  return null;
}

/** Lädt die Mixamo-Clips des Songs (Suspense: Screenshots warten darauf). */
export function MixamoClips({ ids }: { ids: string[] }) {
  use(loadMixamo(ids));
  return null;
}

/** Tageszeit aus der Uhr, jede Minute neu (aus = keine Uhr, z. B. in Demos) */
export function useDayPhase(on: boolean): DayPhase | undefined {
  const [phase, setPhase] = useState<DayPhase | undefined>(undefined);
  useEffect(() => {
    if (!on) return;
    const tick = () => setPhase(dayPhaseAt(new Date()));
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [on]);
  return on ? phase : undefined;
}
