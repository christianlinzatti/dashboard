"use client";

import { DROP_TOLERANCE_MS, lastDropBefore } from "@/lib/song-memory/memory";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Object3D, type PointLight, type SpotLight } from "three";
import {
  REF_ASPECT,
  cameraAt,
  fitAspect,
  focusTimeline,
  headingAt,
  phraseIndexAt,
  positionsAt,
  rotateOnStage,
  shotAt,
  stageAngleAt,
} from "@/lib/dance/evaluate";
import type { Choreography } from "@/lib/dance/plan";
import { settings } from "@/lib/settings";
import type { SongStatic } from "@/lib/song-context/schema";
import { songContext } from "@/lib/song-context/store";
import { lightsAt, type LightFrame } from "@/lib/stage/lights";
import { lightBus } from "@/lib/stage/light-bus";
import type { Theme } from "@/lib/stage/themes";
import type { Frame } from "./types";

/** Nebelbeginn der Szene (siehe <fog> in Stage.tsx) */
export const FOG_NEAR = 9;

/** Berechnet pro Frame Songzeit, Positionen, Fokus (Sänger) und Kamera. Läuft vor den Avataren. */
type DirectorProps = {
  song: SongStatic;
  choreo: Choreography;
  frameRef: React.RefObject<Frame>;
  lightsRef: React.RefObject<LightFrame | null>;
  heads: number;
  strobeRef: React.RefObject<HTMLDivElement | null>;
  /** Blackout-Ebene und Countdown-Ziffer über der Bühne */
  blackoutRef: React.RefObject<HTMLDivElement | null>;
  countdownRef: React.RefObject<HTMLDivElement | null>;
  /** warmer Schein der Blinder über dem Bild (sie strahlen in die Kamera) */
  glareRef?: React.RefObject<HTMLDivElement | null>;
  theme: Theme;
};

/** Bekannter (a) und live gemessener Drop (b): derselbe Drop (knapp danach gemessen) zählt nur einmal, sonst der jüngere */
const latestDrop = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.abs(a - b) <= DROP_TOLERANCE_MS ? a : Math.max(a, b);

export function Director({
  song,
  choreo,
  frameRef,
  lightsRef,
  heads,
  strobeRef,
  blackoutRef,
  countdownRef,
  glareRef,
  theme,
}: DirectorProps) {
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
  useFrame(({ gl, camera, scene }) => {
    const { positionMs, playback, frozen, derived, live } = songContext.getState();
    const t = positionMs;
    // Drehbühne: Formation dreht sich mit dem Podest um die Bühnenmitte
    const stageAngle = stageAngleAt(choreo, t);
    const positions = Object.fromEntries(
      Object.entries(positionsAt(choreo, t, { timeline, avatarOf })).map(([id, p]) => [id, rotateOnStage(p, stageAngle)]),
    );
    // Auftritt: in Gehrichtung schauen (Platz vor der Drehung der Drehbühne bestimmt die Seite)
    const raw = positionsAt(choreo, t, { timeline, avatarOf });
    const headings = Object.fromEntries(choreo.order.map((id) => [id, headingAt(choreo, id, t, raw[id]?.[0] ?? 0)]));
    const focus = avatarOf(derived.activeSingerId) ?? choreo.order[0];
    const mic = live.micActive;
    // Puls: kurz nach jedem Schlag hell, dann abklingend; ohne Mikro ruhig
    // mit gehörter Bassdrum: Puls auf jedem echten Kick (kurz und hart), sonst auf dem gezählten Schlag
    const kick = mic && live.drums.kick !== null && t >= live.drums.kick ? Math.exp(-(t - live.drums.kick) / 120) : 0;
    const pulse = mic ? Math.max(Math.pow(1 - live.beatPhase, 3), kick) : 0;
    frameRef.current = {
      t,
      playing: frozen || playback.isPlaying,
      positions,
      focus,
      anchorMs: mic ? live.gridAnchorMs : null,
      // Drop: bekannt aus dem Song-Gedächtnis (punktgenau) oder live gemessen – der jüngere zählt
      dropMs: latestDrop(lastDropBefore(choreo.knownDrops ?? [], t), mic ? live.lastDropMs : null),
      pulse,
      vocal: mic ? live.vocal : 0,
      energy: mic ? live.energy : 0.5,
      micActive: mic,
      stageAngle,
      headings,
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
    if (blackoutRef.current) blackoutRef.current.style.opacity = String(lf.blackout);
    if (glareRef?.current) glareRef.current.style.opacity = String(lf.blinders * 0.5);
    const cd = countdownRef.current;
    if (cd) {
      const text = lf.countdown === null ? "" : String(lf.countdown);
      if (cd.textContent !== text) cd.textContent = text;
      // jede Ziffer leuchtet beim Schlag auf und klingt ab
      const beat =
        lf.countdown === null ? 1 : ((((t - (choreo.climaxes.find((k) => k.atMs > t)?.atMs ?? t)) / choreo.beatMs) % 1) + 1) % 1;
      cd.style.opacity = lf.countdown === null ? "0" : String(0.55 + 0.45 * (1 - beat));
    }

    // Handy hochkant: zurücktreten, bis dieselbe Bühnenbreite im Bild ist; Nebel rückt mit
    const aspect = "aspect" in camera ? (camera.aspect as number) : REF_ASPECT;
    const { cam, distance } = fitAspect(cameraAt(choreo, t, focus ? positions[focus] : undefined), aspect);
    if (scene.fog && "near" in scene.fog) {
      scene.fog.near = FOG_NEAR * distance;
      scene.fog.far = theme.fogFar * distance;
    }
    camera.position.set(...cam.pos);
    if ("fov" in camera && Math.abs(camera.fov - cam.fov) > 0.01) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(...cam.target);
    // für Tests und Debug: aktuelle Kameraeinstellung und Drehbühne am Canvas
    const phrase = choreo.phrases[phraseIndexAt(choreo, t)];
    const label = `${shotAt(choreo, t)}${phrase?.turn ? "+drehbuehne" : ""}`;
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
