"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import type { Band as BandPlan } from "@/lib/stage/band";
import { deckAngle, drumHits, keysAt } from "@/lib/stage/musicians";
import { songContext } from "@/lib/song-context/store";
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
              band={{
                clip: m.clip,
                position: m.position,
                lift: RISER,
                role: m.role,
                offset: m.role === "bass" ? 1.3 : 0,
                rock: band.kind === "rock",
              }}
            />
            <group position-y={RISER}>
              {m.role === "dj" && <DjBooth x={x} z={z} accent={accent} choreo={choreo} frameRef={frameRef} />}
              {m.role === "schlagzeug" && <DrumKit x={x} z={z} accent={accent} choreo={choreo} frameRef={frameRef} />}
              {m.role === "keyboard" && <Keyboard x={x} z={z} accent={accent} choreo={choreo} frameRef={frameRef} />}
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

type Live = { choreo: Choreography; frameRef: React.RefObject<Frame> };

/** DJ-Pult: Tisch mit leuchtender Front, zwei Plattenteller (drehen sich mit 33⅓), Mischpult */
function DjBooth({ x, z, accent, choreo, frameRef }: { x: number; z: number; accent: string } & Live) {
  const decks = useRef<(Group | null)[]>([]);
  const front = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const f = frameRef.current;
    if (!f.playing) return;
    const a = deckAngle(f.t);
    decks.current.forEach((d) => d && (d.rotation.y = -a));
    // Front pulsiert mit der Bassdrum
    const heard = f.micActive ? songContext.getState().live.drums : null;
    if (front.current) front.current.opacity = 0.55 + 0.45 * drumHits(choreo, f.t, f.anchorMs, heard).kick;
  });
  return (
    <group position={[x, 0, z + 0.5]}>
      <mesh position-y={0.52}>
        <boxGeometry args={[1.7, 1.04, 0.62]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      {/* Leuchtstreifen an der Front */}
      <mesh position={[0, 0.55, 0.315]}>
        <planeGeometry args={[1.5, 0.08]} />
        <meshBasicMaterial ref={front} color={accent} toneMapped={false} transparent />
      </mesh>
      <mesh position={[0, 0.3, 0.315]}>
        <planeGeometry args={[1.5, 0.04]} />
        <Glow color={accent} opacity={0.6} />
      </mesh>
      {[-0.5, 0.5].map((dx, i) => (
        <group key={dx} position={[dx, 1.06, 0]} ref={(g) => void (decks.current[i] = g)}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, 0.03, 32]} />
            <meshStandardMaterial color="#111" roughness={0.3} />
          </mesh>
          <mesh position-y={0.02}>
            <cylinderGeometry args={[0.05, 0.05, 0.02, 16]} />
            <Glow color={accent} />
          </mesh>
          {/* Markierung auf der Platte: macht die Drehung sichtbar */}
          <mesh position={[0.13, 0.018, 0]}>
            <boxGeometry args={[0.07, 0.004, 0.012]} />
            <Glow color="#ffffff" />
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

/** Schlagzeug: Bassdrum, Snare, Toms, Standtom, zwei Becken, Hocker – Felle leuchten bei Treffern, Becken schwingen */
function DrumKit({ x, z, accent, choreo, frameRef }: { x: number; z: number; accent: string } & Live) {
  const kick = useRef<MeshBasicMaterial>(null);
  const snare = useRef<MeshStandardMaterial>(null);
  const cymbals = useRef<(Mesh | null)[]>([]);
  useFrame(() => {
    const f = frameRef.current;
    // mit Mikrofon spielt das Schlagzeug die gehörten Schläge, sonst nach dem Raster
    const heard = f.micActive ? songContext.getState().live.drums : null;
    const h = f.playing ? drumHits(choreo, f.t, f.anchorMs, heard) : { kick: 0, snare: 0, hat: 0, crash: 0 };
    if (kick.current) kick.current.opacity = 0.25 + 0.75 * h.kick;
    if (snare.current) snare.current.emissiveIntensity = 0.6 * h.snare;
    cymbals.current.forEach((c, i) => {
      if (!c) return;
      const hit = i === 0 ? Math.max(h.crash, h.hat * 0.4) : h.crash;
      c.rotation.x = 0.15 + hit * 0.22 * Math.sin(f.t / 45);
      (c.material as MeshStandardMaterial).emissiveIntensity = hit * 1.2;
    });
  });
  const shell = { color: accent, metalness: 0.4, roughness: 0.35 } as const;
  const drum = (pos: [number, number, number], r: number, h: number, isSnare = false) => (
    <group position={pos}>
      <mesh>
        <cylinderGeometry args={[r, r, h, 24]} />
        <meshStandardMaterial {...shell} />
      </mesh>
      <mesh position-y={h / 2 + 0.001}>
        <cylinderGeometry args={[r * 0.97, r * 0.97, 0.004, 24]} />
        <meshStandardMaterial
          ref={isSnare ? snare : undefined}
          color="#e8e4dc"
          roughness={0.8}
          emissive={accent}
          emissiveIntensity={0}
        />
      </mesh>
    </group>
  );
  const cymbal = (cx: number, cz: number, y: number, i: number) => (
    <group position={[cx, 0, cz]}>
      <mesh position-y={y / 2}>
        <cylinderGeometry args={[0.012, 0.012, y, 8]} />
        <meshStandardMaterial {...METAL} />
      </mesh>
      <mesh position-y={y} rotation-x={0.15} ref={(m) => void (cymbals.current[i] = m)}>
        <cylinderGeometry args={[0.24, 0.24, 0.008, 32]} />
        <meshStandardMaterial color="#c9a84a" metalness={0.9} roughness={0.25} emissive="#ffe9a8" emissiveIntensity={0} />
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
          <meshBasicMaterial ref={kick} color={accent} toneMapped={false} transparent opacity={0.5} />
        </mesh>
      </group>
      {drum([-0.32, 0.62, 0.42], 0.17, 0.12, true)}
      {drum([-0.12, 0.82, 0.6], 0.13, 0.14)}
      {drum([0.14, 0.82, 0.6], 0.14, 0.15)}
      {drum([0.42, 0.42, 0.35], 0.2, 0.36)}
      {cymbal(-0.55, 0.62, 1.15, 0)}
      {cymbal(0.6, 0.72, 1.25, 1)}
    </group>
  );
}

/** Keyboard auf X-Ständer mit leuchtender Tastatur-Kante; gedrückte Tastengruppen leuchten im Anschlag */
function Keyboard({ x, z, accent, choreo, frameRef }: { x: number; z: number; accent: string } & Live) {
  const zones = useRef<(MeshBasicMaterial | null)[]>([]);
  useFrame(() => {
    const f = frameRef.current;
    const k = f.playing ? keysAt(choreo, f.t, f.anchorMs) : { zones: [false, false, false, false], press: 0 };
    zones.current.forEach((m, i) => {
      if (!m) return;
      m.opacity = k.zones[i] ? 0.35 + 0.65 * k.press : 0;
      // dunkle Tastengruppen gar nicht erst zeichnen (durchsichtig kostet trotzdem einen Zeichenaufruf)
      m.visible = m.opacity > 0.005;
    });
  });
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
      {/* Tastengruppen (vier Lagen), leuchten beim Anschlag */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[-0.435 + i * 0.29, 0.954, 0.06]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.27, 0.15]} />
          <meshBasicMaterial
            ref={(m) => void (zones.current[i] = m)}
            color={accent}
            toneMapped={false}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** E-Gitarre (oder Bass: dunkler, längerer Hals) vor dem Körper des Musikers (im Avatar-Raum, schräg gehalten) */
export function Guitar({ bass = false }: { bass?: boolean }) {
  const neck = bass ? 0.7 : 0.55;
  return (
    <group position={[0.02, 0.98, 0.2]} rotation={[0.1, 0, 0.95]}>
      {/* Korpus */}
      <mesh>
        <boxGeometry args={[bass ? 0.38 : 0.36, bass ? 0.46 : 0.42, 0.06]} />
        <meshStandardMaterial color={bass ? "#1b2a4a" : "#b3122e"} metalness={0.3} roughness={0.35} />
      </mesh>
      {/* Hals und Kopf */}
      <mesh position-y={0.2 + neck / 2}>
        <boxGeometry args={[0.06, neck, 0.035]} />
        <meshStandardMaterial color="#3b2416" roughness={0.6} />
      </mesh>
      <mesh position-y={0.26 + neck}>
        <boxGeometry args={[0.09, 0.12, 0.03]} />
        <meshStandardMaterial color="#111" />
      </mesh>
    </group>
  );
}
