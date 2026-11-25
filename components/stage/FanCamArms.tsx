"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, Vector3, type Group } from "three";
import { shotAt } from "@/lib/dance/evaluate";
import type { Choreography } from "@/lib/dance/plan";
import type { Frame } from "./types";

/** Arme vor der Handkamera: [seitlich, Höhe, Abstand, Takt-Versatz] relativ zur Kamera */
const ARMS: Array<[number, number, number, number]> = [
  [-0.46, -0.27, 1.3, 0],
  [0.56, -0.33, 1.5, 0.5],
  [0.12, -0.4, 2.0, 0.25],
];

/**
 * Handkamera aus der ersten Reihe: im Vordergrund ragen erhobene Arme von Fans ins Bild (dunkle Silhouetten, eine
 * Hand hält ein Handy hoch) und wippen im Takt. Nur sichtbar, solange die Einstellung „fan“ läuft.
 */
export function FanCamArms({
  choreo,
  frameRef,
  dark,
  accent,
}: {
  choreo: Choreography;
  frameRef: React.RefObject<Frame>;
  dark: string;
  accent: string;
}) {
  const group = useRef<Group>(null);
  // dunkle Silhouetten, leicht in der Lichtfarbe der Bühne
  const color = useMemo(() => new Color(dark).lerp(new Color(accent), 0.28), [dark, accent]);
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const f = frameRef.current;
    g.visible = f.playing && shotAt(choreo, f.t) === "fan";
    if (!g.visible) return;
    // an die Kamera heften: gleiche Lage, Arme vor der Linse
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    const beat = f.t / choreo.beatMs;
    g.children.forEach((arm, i) => {
      const [x, y, z, off] = ARMS[i]!;
      const pump = Math.abs(Math.sin(Math.PI * (beat + off)));
      arm.position.copy(v.set(x, y + 0.08 * pump, -z));
      arm.rotation.set(0, 0, (x < 0 ? -1 : 1) * (0.25 + 0.1 * pump));
    });
  });
  return (
    <group ref={group} visible={false}>
      {ARMS.map(([x], i) => (
        <group key={i}>
          {/* Unterarm und Hand */}
          <mesh position-y={-0.25}>
            <cylinderGeometry args={[0.035, 0.045, 0.55, 8]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh position-y={0.06}>
            <sphereGeometry args={[0.055, 10, 8]} />
            <meshBasicMaterial color={color} />
          </mesh>
          {i === 0 && (
            // Handy mit leuchtendem Display
            <mesh position={[x < 0 ? 0.02 : -0.02, 0.15, 0.01]}>
              <boxGeometry args={[0.06, 0.11, 0.01]} />
              <meshBasicMaterial color="#cfe3ff" toneMapped={false} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
