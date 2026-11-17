"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Object3D, type PointLight, type SpotLight } from "three";
import { cameraAt, focusTimeline, phraseIndexAt, positionsAt, rotateOnStage, stageAngleAt } from "@/lib/dance/evaluate";
import type { Choreography } from "@/lib/dance/plan";
import { settings } from "@/lib/settings";
import type { SongStatic } from "@/lib/song-context/schema";
import { songContext } from "@/lib/song-context/store";
import { lightsAt, type LightFrame } from "@/lib/stage/lights";
import { lightBus } from "@/lib/stage/light-bus";
import type { Theme } from "@/lib/stage/themes";
import type { Frame } from "./types";

/** Berechnet pro Frame Songzeit, Positionen, Fokus (Sänger) und Kamera. Läuft vor den Avataren. */
type DirectorProps = {
  song: SongStatic;
  choreo: Choreography;
  frameRef: React.RefObject<Frame>;
  lightsRef: React.RefObject<LightFrame | null>;
  heads: number;
  strobeRef: React.RefObject<HTMLDivElement | null>;
  theme: Theme;
};

export function Director({ song, choreo, frameRef, lightsRef, heads, strobeRef, theme }: DirectorProps) {
  const spot = useRef<SpotLight>(null);
  const back = useRef<PointLight>(null);
  const target = useMemo(() => new Object3D(), []);
  const timeline = useMemo(() => focusTimeline(song), [song]);
  const avatarOf = useMemo(() => {
    const map = new Map(song.cast.filter((c) => c.artistId).map((c) => [c.artistId!, c.avatarId]));
    return (artistId: string | undefined) => (artistId ? map.get(artistId) : undefined);
  }, [song.cast]);
  const singerColor = (artistId: string | undefined) =>
    song.artists.find((a) => a.spotifyId === artistId)?.color ?? song.album.palette.accent;

  const shot = useRef("");
  useFrame(({ gl, camera }) => {
    const { positionMs, playback, frozen, derived, live } = songContext.getState();
    const t = positionMs;
    // Drehbühne: Formation dreht sich mit dem Podest um die Bühnenmitte
    const stageAngle = stageAngleAt(choreo, t);
    const positions = Object.fromEntries(
      Object.entries(positionsAt(choreo, t, { timeline, avatarOf })).map(([id, p]) => [id, rotateOnStage(p, stageAngle)]),
    );
    const focus = avatarOf(derived.activeSingerId) ?? choreo.order[0];
    const mic = live.micActive;
    // Puls: kurz nach jedem Schlag hell, dann abklingend; ohne Mikro ruhig
    const pulse = mic ? Math.pow(1 - live.beatPhase, 3) : 0;
    frameRef.current = {
      t,
      playing: frozen || playback.isPlaying,
      positions,
      focus,
      anchorMs: mic ? live.gridAnchorMs : null,
      dropMs: mic ? live.lastDropMs : null,
      pulse,
      vocal: mic ? live.vocal : 0,
      energy: mic ? live.energy : 0.5,
      micActive: mic,
      stageAngle,
    };
    if (back.current) back.current.intensity = 18 + frameRef.current.energy * 14 + pulse * 30;

    // Lichtszene (LightDirector) – auch Grundlage für externe Lampen (Govee)
    const lf = lightsAt(song, choreo, heads, {
      t,
      anchorMs: frameRef.current.anchorMs,
      dropMs: frameRef.current.dropMs,
      energy: live.energy,
      micActive: mic,
      singerColor: derived.activeSingerId ? singerColor(derived.activeSingerId) : undefined,
      strobeAllowed: settings.getState().strobe,
      headLevel: theme.headLevel,
      lasers: theme.lasers,
    });
    lightsRef.current = lf;
    lightBus.publish(lf);
    if (strobeRef.current) strobeRef.current.style.opacity = String(lf.strobe * 0.55);

    const cam = cameraAt(choreo, t, focus ? positions[focus] : undefined);
    camera.position.set(...cam.pos);
    if ("fov" in camera && Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(...cam.target);
    // für Tests und Debug: aktuelle Kameraeinstellung und Drehbühne am Canvas
    const phrase = choreo.phrases[phraseIndexAt(choreo, t)];
    const label = `${phrase?.camera ?? "totale"}${phrase?.turn ? "+drehbuehne" : ""}`;
    if (label !== shot.current) gl.domElement.dataset.camera = shot.current = label;
    if (phrase && gl.domElement.dataset.moment !== phrase.moment) gl.domElement.dataset.moment = phrase.moment;

    // Spotlight folgt dem aktiven Sänger (sonst dem Lead)
    const p = focus ? positions[focus] : undefined;
    if (spot.current && p) {
      target.position.set(p[0], 0.9, p[1]);
      spot.current.position.set(p[0] * 0.6, 5.5, p[1] + 2.5);
      spot.current.color.set(singerColor(derived.activeSingerId));
      spot.current.intensity = 45 + frameRef.current.energy * 30 + pulse * 25;
    }
  }, -1);

  return (
    <>
      <primitive object={target} />
      <spotLight ref={spot} target={target} angle={0.32} penumbra={0.6} intensity={60} distance={12} />
      <pointLight ref={back} position={[0, 3, -2]} color={song.album.palette.accent} intensity={25} distance={10} />
    </>
  );
}
