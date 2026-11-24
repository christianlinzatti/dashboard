"use client";

import { useFrame } from "@react-three/fiber";
import { use, useEffect, useRef, useState } from "react";
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
export function FpsMeter({ quality }: { quality: Quality }) {
  const times = useRef<number[]>([]);
  const last = useRef(0);
  useFrame((state, dt) => {
    times.current.push(dt);
    if (state.clock.elapsedTime - last.current < 2) return;
    last.current = state.clock.elapsedTime;
    perf.setState({ fps: fpsFrom(times.current), quality });
    times.current = [];
  });
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
