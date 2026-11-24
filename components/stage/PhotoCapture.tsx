"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import { photoStore } from "@/lib/photo/store";

/**
 * Aufnahme für das Erinnerungsfoto: liest die Bühne direkt nach dem Zeichnen eines Bildes (Priorität 2 – nach der
 * Nachbearbeitung mit Bloom auf 1). Nur solange eine Aufnahme ansteht eingehängt: ein Rückruf mit Priorität > 0 schaltet
 * das automatische Zeichnen von R3F ab, ohne Bloom zeichnet die Aufnahme deshalb selbst. So muss die Bühne ihren
 * Bildspeicher nicht dauerhaft aufbewahren (preserveDrawingBuffer kostet auf dem Pi Leistung).
 */
export function PhotoCapture({ bloom }: { bloom: boolean }) {
  const phase = useStore(photoStore, (s) => s.phase);
  return phase === "aufnahme" ? <Grab bloom={bloom} /> : null;
}

function Grab({ bloom }: { bloom: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const done = useRef(false);
  // angehaltene Szene (Demos) zeichnet nur auf Anforderung
  useEffect(() => invalidate(), [invalidate]);
  useFrame(({ gl, scene, camera }) => {
    if (done.current) return;
    if (!bloom) gl.render(scene, camera);
    done.current = true;
    try {
      photoStore.getState().captured(gl.domElement.toDataURL("image/jpeg", 0.92));
    } catch {
      photoStore.getState().failed("Die Bühne lässt sich nicht fotografieren.");
    }
  }, 2);
  return null;
}
