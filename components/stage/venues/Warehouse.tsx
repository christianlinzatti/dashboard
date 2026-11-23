"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, type InstancedMesh } from "three";
import { TRUSS_Y, TRUSS_Z } from "../layout";
import { concreteTexture, Instances, mat, songSeconds, type VenueProps } from "./shared";

const TUBES = 10;
const tubeMatrices = Array.from({ length: TUBES }, (_, i) => mat({ p: [-5.4 + (i * 10.8) / (TUBES - 1), 2.4, TRUSS_Z - 0.6] }));
const pillarMatrices = [-7.5, 7.5].flatMap((x) => [-1.5, 3.5, 8.5].map((z) => mat({ p: [x, 3, z] })));
const BEAM_Z = [-1.8, 1.4, 4.6, 7.8];
/** I-Profil: Steg und zwei Gurte */
const webMatrices = BEAM_Z.map((z) => mat({ p: [0, 6.1, z] }));
const flangeMatrices = BEAM_Z.flatMap((z) => [-0.25, 0.25].map((y) => mat({ p: [0, 6.1 + y, z] })));

/** Rohe Betonwand mit senkrechten Leuchtröhren (blitzen im Takt), Stahlträger unter der Decke, Säulen. */
export function Warehouse({ lightsRef, accent }: VenueProps) {
  const tex = useMemo(() => {
    const t = concreteTexture("beton-wand");
    t.repeat.set(4, 2);
    return t;
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  const tubes = useRef<InstancedMesh>(null);
  const red = useMemo(() => new Color(accent), [accent]);
  const white = useMemo(() => new Color("#f4f4ff"), []);
  const startColors = useMemo(() => tubeMatrices.map(() => new Color(0, 0, 0)), []);
  const c = useMemo(() => new Color(), []);
  useFrame(() => {
    const m = tubes.current;
    if (!m) return;
    const l = lightsRef.current;
    const t = songSeconds();
    const p = l?.signal.pulse ?? 0;
    const chase = l?.signal.chase ?? -1;
    for (let i = 0; i < TUBES; i++) {
      // Lauflicht beim großen Einsatz, sonst abwechselnd rot/weiß im Takt
      const on =
        chase >= 0 ? (Math.abs(i / (TUBES - 1) - chase) < 0.15 ? 1 : 0.1) : 0.35 + 0.65 * p * ((i + Math.floor(t * 2)) % 2);
      m.setColorAt(i, c.copy(i % 2 ? red : white).multiplyScalar(on * 1.6 * (1 - 0.9 * (l?.blackout ?? 0))));
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <group>
      <mesh position={[0, 3, TRUSS_Z - 0.7]}>
        <planeGeometry args={[18, 8]} />
        <meshStandardMaterial map={tex} roughness={0.95} color="#9a9a9a" />
      </mesh>
      <Instances matrices={tubeMatrices} colors={startColors} meshRef={tubes}>
        <boxGeometry args={[0.07, 3.8, 0.07]} />
        <meshBasicMaterial toneMapped={false} />
      </Instances>
      {/* Säulen */}
      <Instances matrices={pillarMatrices}>
        <boxGeometry args={[0.6, 6.5, 0.6]} />
        <meshStandardMaterial map={tex} roughness={0.95} color="#7d7d7d" />
      </Instances>
      {/* Stahlträger unter der Decke (I-Profile) */}
      <Instances matrices={webMatrices}>
        <boxGeometry args={[16, 0.5, 0.06]} />
        <meshStandardMaterial color="#26262b" metalness={0.8} roughness={0.45} />
      </Instances>
      <Instances matrices={flangeMatrices}>
        <boxGeometry args={[16, 0.05, 0.32]} />
        <meshStandardMaterial color="#26262b" metalness={0.8} roughness={0.45} />
      </Instances>
      {/* Traverse für die Lampen */}
      <mesh position={[0, TRUSS_Y, TRUSS_Z]}>
        <boxGeometry args={[11, 0.18, 0.18]} />
        <meshStandardMaterial color="#2a2a33" metalness={0.8} roughness={0.35} />
      </mesh>
    </group>
  );
}
