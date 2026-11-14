"use client";

import { useFrame } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import { AnimationMixer, Box3, Object3D, Vector3, type AnimationAction, type Group } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { avatarById } from "@/lib/avatars/catalog";
import { IDLE_CLIP } from "@/lib/dance/clips";
import { layersAt, type Layer } from "@/lib/dance/evaluate";
import type { Choreography } from "@/lib/dance/plan";
import type { CastMember, SongStatic } from "@/lib/song-context/schema";
import { ErrorBoundary } from "../ErrorBoundary";
import { TARGET_HEIGHT, type Frame } from "./types";

type AvatarProps = { member: CastMember; song: SongStatic; choreo: Choreography; frameRef: React.RefObject<Frame> };

/** Ein Avatar; scheitert das Laden (z. B. Netzwerk), fehlt nur dieser Tänzer – die Bühne läuft weiter. */
export function Avatar(props: AvatarProps) {
  const info = avatarById.get(props.member.avatarId);
  if (!info) return null;
  return (
    <ErrorBoundary fallback={null} label={`Avatar ${info.id}`}>
      <AvatarModel url={info.url} {...props} />
    </ErrorBoundary>
  );
}

function AvatarModel({ url, member, song, choreo, frameRef }: AvatarProps & { url: string }) {
  const { scene, animations } = useGLTF(url);
  const group = useRef<Group>(null);
  const ledsTouched = useRef(false);

  const { root, mixer, leds } = useMemo(() => {
    const model = cloneSkinned(scene) as Group;
    model.updateMatrixWorld(true); // Bone-Matrizen aktualisieren, sonst ist die Skinned-Bounding-Box falsch
    const box = new Box3().setFromObject(model, true);
    const size = box.getSize(new Vector3());
    const scale = TARGET_HEIGHT / Math.max(size.y, 0.001);
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;
    // LED-Gesicht: Balken (Stimme) und Augen (Beat)
    const leds = {
      bars: [0, 1, 2, 3, 4].map((i) => model.getObjectByName(`FaceLedBar${i}`)).filter((b): b is Object3D => !!b),
      eyes: ["FaceLedEyeLeft", "FaceLedEyeRight"].map((n) => model.getObjectByName(n)).filter((b): b is Object3D => !!b),
    };
    return { root: model, mixer: new AnimationMixer(model), leds };
  }, [scene]);
  const clipSet = useMemo(() => new Set(animations.map((a) => a.name)), [animations]);

  const actions = useRef(new Map<string, AnimationAction>());
  useEffect(() => {
    const map = actions.current;
    return () => {
      mixer.stopAllAction();
      map.clear();
    };
  }, [mixer]);

  const action = (name: string) => {
    let a = actions.current.get(name);
    if (!a) {
      const clip = animations.find((c) => c.name === name);
      if (!clip) return undefined;
      a = mixer.clipAction(clip);
      a.play();
      actions.current.set(name, a);
    }
    return a;
  };

  // Clip-Ebenen aus dem Plan setzen (zustandslos: gleiche Songzeit → gleiche Pose)
  useFrame(() => {
    const f = frameRef.current;
    const layers: Layer[] = f.playing
      ? layersAt(choreo, member.avatarId, f.t, { anchorMs: f.anchorMs, dropMs: f.dropMs, clipsOf: () => clipSet })
      : [{ clip: IDLE_CLIP, time: performance.now() / 1000, weight: 1 }];
    for (const a of actions.current.values()) a.setEffectiveWeight(0);
    for (const l of layers) {
      const a = action(l.clip) ?? action(IDLE_CLIP);
      if (!a) continue;
      const d = a.getClip().duration || 1;
      a.enabled = true;
      a.setEffectiveWeight(l.weight);
      a.time = l.time % d;
    }
    mixer.update(0);

    // LED-Gesicht nach der Animation überschreiben (nur mit Mikrofon, sonst Originalpose)
    if (f.micActive) {
      const singing = !f.focus || f.focus === member.avatarId ? f.vocal : f.vocal * 0.3;
      leds.bars.forEach((b, i) => b.scale.setScalar(0.35 + singing * (0.9 + 0.5 * Math.sin(f.t / 90 + i * 1.7))));
      leds.eyes.forEach((e) => e.scale.setScalar(1 + f.pulse * 0.35));
    } else if (ledsTouched.current) {
      // Mikro aus: LED-Gesicht wieder in Grundstellung
      [...leds.bars, ...leds.eyes].forEach((b) => b.scale.setScalar(1));
    }
    ledsTouched.current = f.micActive;

    const p = f.positions[member.avatarId];
    if (group.current && p) group.current.position.set(p[0], 0, p[1]);
  });

  const artist = song.track.isFeature ? song.artists.find((a) => a.spotifyId === member.artistId) : undefined;

  return (
    <group ref={group}>
      <primitive object={root} />
      {artist && (
        <Html position={[0, TARGET_HEIGHT + 0.05, 0]} center zIndexRange={[10, 0]} pointerEvents="none">
          <span
            className="whitespace-nowrap rounded-full px-3 py-1 text-[clamp(11px,1.8vmin,18px)] font-bold text-black shadow"
            style={{ background: artist.color }}
            data-testid="name-tag"
          >
            {artist.name}
          </span>
        </Html>
      )}
    </group>
  );
}
