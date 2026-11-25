"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, DoubleSide, RepeatWrapping, SRGBColorSpace, type MeshBasicMaterial } from "three";
import { rng } from "@/lib/dance/rng";
import type { LightFrame } from "@/lib/stage/lights";

/** Beine des Mischpult-Turms */
const LEGS: Array<[number, number]> = [
  [-1.4, -1.1],
  [1.4, -1.1],
  [-1.4, 1.1],
  [1.4, 1.1],
];

/** Abstand der hinteren Publikumsreihen (die echte Menge reicht bis etwa 13 m) */
const FAR_R = 15.5;

/**
 * Silhouetten weiterer Reihen als Streifen: Köpfe und Schultern, ein paar erhobene Arme, einzelne Lichtpunkte
 * (Handys, Armbänder). Ein Bild, das sich ringsum wiederholt.
 */
function farCrowdTexture(dark: string, glow: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const g = c.getContext("2d");
  const t = new CanvasTexture(c);
  if (!g) return t;
  const r = rng("hinterland");
  const body = new Color(dark).lerp(new Color("#3a3350"), 0.35).getStyle();
  g.fillStyle = body;
  for (let i = 0; i < 70; i++) {
    const x = r.next() * 512;
    const h = 46 + r.next() * 22; // Schulterhöhe von unten
    const w = 12 + r.next() * 6;
    g.fillRect(x - w / 2, 96 - h, w, h);
    g.beginPath();
    g.arc(x, 96 - h - 6, 6 + r.next() * 1.5, 0, Math.PI * 2);
    g.fill();
    if (r.next() < 0.3) g.fillRect(x + w / 2 - 2, 96 - h - 26, 3, 26); // Arm hoch
  }
  g.fillStyle = glow;
  for (let i = 0; i < 26; i++) g.fillRect(r.next() * 512, 8 + r.next() * 30, 2, 3);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.repeat.set(9, 1);
  return t;
}

/**
 * Was hinter der Menge steht (zu sehen von der B-Bühne aus und beim Eröffnungsflug): weitere Reihen als Silhouetten,
 * der Mischpult-Turm (FOH) mit Pult-Lichtern und zwei Delay-Türme mit Lautsprechern. Nur auf großen Bühnen.
 */
export function Hinterland({
  dark,
  accent,
  lightsRef,
}: {
  dark: string;
  accent: string;
  lightsRef: React.RefObject<LightFrame | null>;
}) {
  const tex = useMemo(() => farCrowdTexture(dark, accent), [dark, accent]);
  useEffect(() => () => tex.dispose(), [tex]);
  const desk = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    // Pult-Lichter flackern leicht im Takt
    if (desk.current) desk.current.opacity = 0.55 + 0.45 * (lightsRef.current?.signal.pulse ?? 0);
  });
  const steel = <meshStandardMaterial color="#1c1c22" metalness={0.6} roughness={0.5} />;
  return (
    <group>
      {/* hintere Reihen: offener Zylinderstreifen um die Bühne, nur vorn (wo die Menge steht) */}
      <mesh position-y={-0.26 + 0.95}>
        <cylinderGeometry args={[FAR_R, FAR_R, 1.9, 72, 1, true, -2.05, 4.1]} />
        <meshBasicMaterial map={tex} transparent alphaTest={0.4} side={DoubleSide} />
      </mesh>
      {/* Mischpult-Turm hinter der Menge */}
      <group position={[0, 0, 14.2]}>
        {LEGS.map(([x, z], i) => (
          <mesh key={i} position={[x, 1.6, z]}>
            <boxGeometry args={[0.1, 3.7, 0.1]} />
            {steel}
          </mesh>
        ))}
        <mesh position-y={1.3}>
          <boxGeometry args={[3, 0.14, 2.4]} />
          {steel}
        </mesh>
        <mesh position-y={3.45}>
          <boxGeometry args={[3.3, 0.12, 2.7]} />
          <meshStandardMaterial color="#121216" roughness={0.8} />
        </mesh>
        {/* Pult und seine Lichter (zur Bühne hin) */}
        <mesh position={[0, 1.75, -0.6]}>
          <boxGeometry args={[2.2, 0.5, 0.7]} />
          <meshStandardMaterial color="#0e0e12" roughness={0.6} />
        </mesh>
        <mesh position={[0, 2.02, -0.6]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[2, 0.5]} />
          <meshBasicMaterial ref={desk} color={accent} transparent toneMapped={false} />
        </mesh>
      </group>
      {/* Delay-Türme links und rechts */}
      {[-7.5, 7.5].map((x) => (
        <group key={x} position={[x, 0, 13.5]}>
          <mesh position-y={3}>
            <boxGeometry args={[0.16, 6.2, 0.16]} />
            {steel}
          </mesh>
          <mesh position={[0, 5.7, -0.15]}>
            <boxGeometry args={[0.8, 1.4, 0.6]} />
            <meshStandardMaterial color="#111114" roughness={0.7} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
