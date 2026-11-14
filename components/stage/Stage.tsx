"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo } from "react";
import { AnimationMixer, Box3, Vector3, type AnimationAction, type Group } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { avatarById, timeScaleFor } from "@/lib/avatars/catalog";
import { songContext, useSongContext } from "@/lib/song-context/store";
import type { CastMember } from "@/lib/song-context/schema";

const SPACING = 1.5;
const TARGET_HEIGHT = 1.8;

/**
 * 3D-Bühne. Lädt nur die Avatare der aktuellen Besetzung (cast), nicht alle.
 * Tanz-Auswahl nach Energie/Abschnitt folgt mit dem DanceDirector (Meilenstein 4/5).
 */
export function Stage() {
  const cast = useSongContext((s) => s.song?.cast ?? []);
  const frozen = useSongContext((s) => s.frozen);
  const dark = useSongContext((s) => s.song?.album.palette.dark ?? "#0b0712");
  const accent = useSongContext((s) => s.song?.album.palette.accent ?? "#ff4fd8");

  return (
    <Canvas
      data-testid="stage"
      dpr={[1, 1.5]}
      frameloop={frozen ? "demand" : "always"}
      camera={{ position: [0, 1.3, 6.4], fov: 36 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={[dark]} />
      <fog attach="fog" args={[dark, 7, 16]} />
      <hemisphereLight args={["#ffffff", dark, 1.2]} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} />
      <pointLight position={[0, 3, -2]} color={accent} intensity={25} distance={10} />
      <mesh rotation-x={-Math.PI / 2} position-y={0}>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color={dark} roughness={0.4} metalness={0.3} />
      </mesh>
      <Suspense fallback={null}>
        {cast.map((c) => (
          <Avatar key={c.avatarId} member={c} />
        ))}
        <ReadySignal />
      </Suspense>
      <CameraTarget />
    </Canvas>
  );
}

function CameraTarget() {
  const camera = useThree((s) => s.camera);
  useEffect(() => camera.lookAt(0, 0.45, 0), [camera]);
  return null;
}

/** Markiert die Szene als fertig gerendert (für Playwright-Screenshots). */
function ReadySignal() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    invalidate();
    let raf = requestAnimationFrame(() => {
      invalidate();
      raf = requestAnimationFrame(() => document.body.setAttribute("data-stage-ready", "true"));
    });
    return () => {
      cancelAnimationFrame(raf);
      document.body.removeAttribute("data-stage-ready");
    };
  }, [invalidate]);
  return null;
}

const ROLE_CLIP: Record<CastMember["role"], string> = {
  lead: "Dance_Groove",
  feature: "Dance_HipHop",
  backup: "Dance_House",
};

function Avatar({ member }: { member: CastMember }) {
  const info = avatarById.get(member.avatarId);
  if (!info) return null;
  return <AvatarModel url={info.url} member={member} />;
}

function AvatarModel({ url, member }: { url: string; member: CastMember }) {
  const { scene, animations } = useGLTF(url);

  const { root, mixer, action } = useMemo(() => {
    const model = cloneSkinned(scene) as Group;
    // Auf einheitliche Größe normieren und auf den Boden stellen
    model.updateMatrixWorld(true); // Bone-Matrizen aktualisieren, sonst ist die Skinned-Bounding-Box falsch
    const box = new Box3().setFromObject(model, true);
    const size = box.getSize(new Vector3());
    const scale = TARGET_HEIGHT / Math.max(size.y, 0.001);
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;
    const mixer = new AnimationMixer(model);
    const clip = animations.find((a) => a.name === ROLE_CLIP[member.role]) ?? animations.find((a) => a.name.startsWith("Dance_"));
    const action: AnimationAction | undefined = clip ? mixer.clipAction(clip).play() : undefined;
    return { root: model, mixer, action };
  }, [scene, animations, member.role]);

  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  // Tanz an Songzeit und Tempo koppeln (deterministisch, auch im eingefrorenen Demo-Modus)
  useFrame(() => {
    if (!action) return;
    const { positionMs, live } = songContext.getState();
    const ts = timeScaleFor(live.bpm);
    const offset = member.role === "lead" ? 0 : 0.25 * Math.abs(member.position); // leichter Kanon
    mixer.setTime((positionMs / 1000) * ts + offset);
  });

  // Eigene Gruppe, damit die Bodenkorrektur des Modells (root.position.y) erhalten bleibt
  return (
    <group position={[member.position * SPACING, 0, -Math.abs(member.position) * 0.6]}>
      <primitive object={root} />
    </group>
  );
}
