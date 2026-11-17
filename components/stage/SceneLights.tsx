"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { DirectionalLight, HemisphereLight } from "three";
import type { LightFrame } from "@/lib/stage/lights";

/** Grundlicht der Szene; dimmt im Blackout vor einem großen Einsatz fast ganz herunter. */
export function SceneLights({ lightsRef, ground }: { lightsRef: React.RefObject<LightFrame | null>; ground: string }) {
  const hemi = useRef<HemisphereLight>(null);
  const dir = useRef<DirectionalLight>(null);
  useFrame(() => {
    const k = 1 - 0.8 * (lightsRef.current?.blackout ?? 0);
    if (hemi.current) hemi.current.intensity = 0.9 * k;
    if (dir.current) dir.current.intensity = 1.5 * k;
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={["#ffffff", ground, 0.9]} />
      <directionalLight ref={dir} position={[3, 5, 4]} intensity={1.5} />
    </>
  );
}
