"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { WebGLRenderer } from "three";

/** Zählung über alle Durchgänge eines Bildes (Nachbearbeitung, Live-Bildschirme) statt nur des letzten */
function countWholeFrames(gl: WebGLRenderer, on: boolean) {
  gl.info.autoReset = !on;
}

/**
 * Zeichenaufrufe und Dreiecke am Canvas (Leistungswächter in der CI, Debug): das teuerste Bild seit dem Laden –
 * reproduzierbar, auch wenn eine angehaltene Szene nur wenige Bilder zeichnet und Modelle erst nach und nach kommen.
 */
function publish(gl: WebGLRenderer) {
  const { calls, triangles } = gl.info.render;
  const d = gl.domElement.dataset;
  if (calls > Number(d.drawcalls ?? 0)) d.drawcalls = String(calls);
  if (triangles > Number(d.triangles ?? 0)) d.triangles = String(triangles);
  gl.info.reset();
}

/**
 * Misst, was ein Bild höchstens kostet: Zeichenaufrufe und Dreiecke – anders als die Bildrate auf jedem Rechner gleich
 * (auch ohne GPU in der CI) und genau das, was einen Raspberry Pi bremst.
 */
export function RenderStats() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    countWholeFrames(gl, true);
    return () => countWholeFrames(gl, false);
  }, [gl]);
  // vor allen anderen: Werte des vorigen Bildes ablegen, dann für dieses Bild neu zählen
  useFrame(({ gl: r }) => publish(r), -1000);
  return null;
}
