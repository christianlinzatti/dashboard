"use client";

import type { Band as BandPlan } from "@/lib/stage/band";
import type { Choreography } from "@/lib/dance/plan";
import type { CastMember, SongStatic } from "@/lib/song-context/schema";
import { Avatar } from "./Avatar";
import type { Frame } from "./types";

/** Höhe des Band-Podests: die Band schaut über die Schultern der Tänzer */
export const RISER = 0.42;

/**
 * Band hinter den Tänzern: Instrumente aus einfachen Formen (wie die übrige Bühne) und die Musiker als Avatare,
 * die im Songtakt spielen. Leuchtakzente in der Akzentfarbe des Covers.
 */
export function Band({
  band,
  song,
  choreo,
  frameRef,
  accent,
}: {
  band: NonNullable<BandPlan>;
  song: SongStatic;
  choreo: Choreography;
  frameRef: React.RefObject<Frame>;
  accent: string;
}) {
  // Musiker tragen den Look der Crew (Outfit und Leuchtstreifen des Leads)
  const lead = song.cast[0];
  const xs = band.members.map((m) => m.position[0]);
  const zs = band.members.map((m) => m.position[1]);
  const [x0, x1] = [Math.min(...xs) - 0.9, Math.max(...xs) + 0.9];
  const [z0, z1] = [Math.min(...zs) - 0.55, Math.max(...zs) + 0.85];
  return (
    <group>
      {/* Podest mit Leuchtkante */}
      <mesh position={[(x0 + x1) / 2, RISER / 2, (z0 + z1) / 2]}>
        <boxGeometry args={[x1 - x0, RISER, z1 - z0]} />
        <meshStandardMaterial color="#141418" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[(x0 + x1) / 2, RISER - 0.03, z1 + 0.001]}>
        <planeGeometry args={[x1 - x0, 0.03]} />
        <Glow color={accent} />
      </mesh>
      {band.members.map((m) => {
        const member: CastMember = { avatarId: m.avatarId, role: "backup", position: 0, outfit: lead?.outfit, trim: lead?.trim };
        const [x, z] = m.position;
        return (
          <group key={m.avatarId}>
            <Avatar
              member={member}
              song={song}
              choreo={choreo}
              frameRef={frameRef}
              band={{ clip: m.clip, position: m.position, lift: RISER, guitar: m.role === "gitarre" }}
            />
            <group position-y={RISER}>
              {m.role === "dj" && <DjBooth x={x} z={z} accent={accent} />}
              {m.role === "schlagzeug" && <DrumKit x={x} z={z} accent={accent} />}
              {m.role === "keyboard" && <Keyboard x={x} z={z} accent={accent} />}
            </group>
          </group>
        );
      })}
    </group>
  );
}

const METAL = { color: "#2a2a30", metalness: 0.7, roughness: 0.35 } as const;

function Glow({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return <meshBasicMaterial color={color} toneMapped={false} transparent={opacity < 1} opacity={opacity} />;
}

/** DJ-Pult: Tisch mit leuchtender Front, zwei Plattenteller, Mischpult */
function DjBooth({ x, z, accent }: { x: number; z: number; accent: string }) {
  return (
    <group position={[x, 0, z + 0.5]}>
      <mesh position-y={0.52}>
        <boxGeometry args={[1.7, 1.04, 0.62]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {/* Leuchtstreifen an der Front */}
      <mesh position={[0, 0.55, 0.315]}>
        <planeGeometry args={[1.5, 0.08]} />
        <Glow color={accent} />
      </mesh>
      <mesh position={[0, 0.3, 0.315]}>
        <planeGeometry args={[1.5, 0.04]} />
        <Glow color={accent} opacity={0.6} />
      </mesh>
      {[-0.5, 0.5].map((dx) => (
        <group key={dx} position={[dx, 1.06, 0]}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, 0.03, 32]} />
            <meshStandardMaterial color="#111" roughness={0.3} />
          </mesh>
          <mesh position-y={0.02}>
            <cylinderGeometry args={[0.05, 0.05, 0.02, 16]} />
            <Glow color={accent} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.08, 0]}>
        <boxGeometry args={[0.36, 0.05, 0.4]} />
        <meshStandardMaterial color="#18181c" />
      </mesh>
    </group>
  );
}

/** Schlagzeug: Bassdrum, Snare, Toms, Standtom, zwei Becken, Hocker */
function DrumKit({ x, z, accent }: { x: number; z: number; accent: string }) {
  const shell = { color: accent, metalness: 0.4, roughness: 0.35 } as const;
  const drum = (pos: [number, number, number], r: number, h: number) => (
    <group position={pos}>
      <mesh>
        <cylinderGeometry args={[r, r, h, 24]} />
        <meshStandardMaterial {...shell} />
      </mesh>
      <mesh position-y={h / 2 + 0.001}>
        <cylinderGeometry args={[r * 0.97, r * 0.97, 0.004, 24]} />
        <meshStandardMaterial color="#e8e4dc" roughness={0.8} />
      </mesh>
    </group>
  );
  const cymbal = (cx: number, cz: number, y: number) => (
    <group position={[cx, 0, cz]}>
      <mesh position-y={y / 2}>
        <cylinderGeometry args={[0.012, 0.012, y, 8]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position-y={y} rotation-x={0.15}>
        <cylinderGeometry args={[0.24, 0.24, 0.008, 32]} />
        <meshStandardMaterial color="#c9a84a" metalness={0.9} roughness={0.25} />
      </mesh>
    </group>
  );
  return (
    <group position={[x, 0, z]}>
      {/* Hocker */}
      <mesh position={[0, 0.26, -0.05]}>
        <cylinderGeometry args={[0.17, 0.15, 0.52, 16]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {/* Bassdrum liegt quer, Fell nach vorn */}
      <group position={[0, 0.3, 0.62]} rotation-x={Math.PI / 2}>
        <mesh>
          <cylinderGeometry args={[0.3, 0.3, 0.36, 32]} />
          <meshStandardMaterial {...shell} />
        </mesh>
        <mesh position-y={-0.181}>
          <cylinderGeometry args={[0.28, 0.28, 0.002, 32]} />
          <Glow color={accent} opacity={0.5} />
        </mesh>
      </group>
      {drum([-0.32, 0.62, 0.42], 0.17, 0.12)}
      {drum([-0.12, 0.82, 0.6], 0.13, 0.14)}
      {drum([0.14, 0.82, 0.6], 0.14, 0.15)}
      {drum([0.42, 0.42, 0.35], 0.2, 0.36)}
      {cymbal(-0.55, 0.62, 1.15)}
      {cymbal(0.6, 0.72, 1.25)}
    </group>
  );
}

/** Keyboard auf X-Ständer mit leuchtender Tastatur-Kante */
function Keyboard({ x, z, accent }: { x: number; z: number; accent: string }) {
  return (
    <group position={[x, 0, z + 0.45]}>
      {[-0.45, 0.45].map((dx) =>
        [0.5, -0.5].map((tilt) => (
          <mesh key={`${dx}${tilt}`} position={[dx, 0.43, 0]} rotation-x={tilt}>
            <boxGeometry args={[0.03, 0.95, 0.03]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
        )),
      )}
      <mesh position-y={0.9}>
        <boxGeometry args={[1.25, 0.09, 0.36]} />
        <meshStandardMaterial color="#141418" roughness={0.4} />
      </mesh>
      {/* weiße Tasten */}
      <mesh position={[0, 0.946, 0.06]}>
        <boxGeometry args={[1.16, 0.012, 0.16]} />
        <meshStandardMaterial color="#f2f0ea" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.91, 0.181]}>
        <planeGeometry args={[1.2, 0.03]} />
        <Glow color={accent} />
      </mesh>
    </group>
  );
}

/** E-Gitarre vor dem Körper des Gitarristen (im Avatar-Raum, schräg gehalten) */
export function Guitar() {
  return (
    <group position={[0.02, 0.98, 0.2]} rotation={[0.1, 0, 0.95]}>
      {/* Korpus */}
      <mesh>
        <boxGeometry args={[0.36, 0.42, 0.06]} />
        <meshStandardMaterial color="#b3122e" metalness={0.3} roughness={0.35} />
      </mesh>
      {/* Hals und Kopf */}
      <mesh position-y={0.47}>
        <boxGeometry args={[0.06, 0.55, 0.035]} />
        <meshStandardMaterial color="#3b2416" roughness={0.6} />
      </mesh>
      <mesh position-y={0.78}>
        <boxGeometry args={[0.09, 0.12, 0.03]} />
        <meshStandardMaterial color="#111" />
      </mesh>
    </group>
  );
}
