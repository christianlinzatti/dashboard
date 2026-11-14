"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, PerformanceMonitor, useGLTF } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { AnimationMixer, Box3, Object3D, Vector3, type AnimationAction, type Group, type PointLight, type SpotLight } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { avatarById } from "@/lib/avatars/catalog";
import { IDLE_CLIP } from "@/lib/dance/clips";
import { cameraAt, focusTimeline, layersAt, positionsAt, type Layer } from "@/lib/dance/evaluate";
import { planChoreography, type Choreography } from "@/lib/dance/plan";
import type { Vec2 } from "@/lib/dance/formations";
import { songContext, useSongContext } from "@/lib/song-context/store";
import type { CastMember, SongStatic } from "@/lib/song-context/schema";
import { lightsAt, type LightFrame } from "@/lib/stage/lights";
import { PRESETS, stepQuality, type Quality } from "@/lib/stage/quality";
import { settings, useSettings } from "@/lib/settings";
import { Fog, StageSet } from "./StageSet";
import { Lasers, MovingHeads } from "./Lights";

const TARGET_HEIGHT = 1.8;

/** Pro Frame berechnete Bühnenwerte, geteilt zwischen Director und Avataren (ohne React-State). */
type Frame = {
  t: number;
  playing: boolean;
  positions: Record<string, Vec2>;
  focus?: string;
  anchorMs: number | null;
  dropMs: number | null;
  /** Licht-/LED-Puls 0..1 (fällt nach jedem Schlag ab) */
  pulse: number;
  vocal: number;
  energy: number;
  micActive: boolean;
};

/**
 * 3D-Bühne. Lädt nur die Avatare der aktuellen Besetzung.
 * Wer was tanzt, wo steht und wie die Kamera schaut, kommt aus dem Choreografie-Plan (lib/dance).
 */
export function Stage({ forceQuality }: { forceQuality?: Quality }) {
  const song = useSongContext((s) => s.song);
  const bpm = useSongContext((s) => Math.round(s.live.bpm));
  const frozen = useSongContext((s) => s.frozen);
  const dark = song?.album.palette.dark ?? "#0b0712";

  // Neu planen nur, wenn sich Song, Abschnitte oder Tempo ändern
  const sectionsKey = song?.lyrics?.sections.map((s) => `${s.kind}${s.startMs}`).join() ?? "";
  const choreo = useMemo(
    () => (song ? planChoreography(song, bpm) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bewusst nur bei inhaltlichen Änderungen
    [song?.trackKey, sectionsKey, bpm, song?.cast],
  );
  const frame = useRef<Frame>({ t: 0, playing: false, positions: {}, anchorMs: null, dropMs: null, pulse: 0, vocal: 0, energy: 0, micActive: false });
  const lights = useRef<LightFrame | null>(null);
  const strobe = useRef<HTMLDivElement>(null);

  // Qualität: fest (Einstellung/URL) oder automatisch nach Bildrate; Demos fest „mittel“ (reproduzierbar)
  const chosen = useSettings((s) => s.quality);
  const [autoQuality, setAutoQuality] = useState<Quality>("mittel");
  useEffect(() => settings.getState().hydrate(), []);
  const quality: Quality = forceQuality ?? (frozen ? "mittel" : chosen === "auto" ? autoQuality : chosen);
  const preset = PRESETS[quality];

  if (!song || !choreo) return null;

  return (
    <div className="absolute inset-0" data-quality={quality}>
    <Canvas
      data-testid="stage"
      dpr={preset.dpr}
      frameloop={frozen ? "demand" : "always"}
      camera={{ position: [0, 1.3, 6.6], fov: 36 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={[dark]} />
      <fog attach="fog" args={[dark, 9, 20]} />
      <hemisphereLight args={["#ffffff", dark, 0.9]} />
      <directionalLight position={[3, 5, 4]} intensity={1.5} />
      {!frozen && chosen === "auto" && !forceQuality && (
        <PerformanceMonitor
          onDecline={() => setAutoQuality((q) => stepQuality(q, -1))}
          onIncline={() => setAutoQuality((q) => stepQuality(q, 1))}
          flipflops={3}
        />
      )}
      <StageSet preset={preset} dark={dark} lightsRef={lights} />
      <MovingHeads key={`h${preset.heads}${preset.realLights}`} count={preset.heads} realLights={preset.realLights} lightsRef={lights} />
      <Lasers key={`l${preset.lasers}`} count={preset.lasers} lightsRef={lights} />
      {preset.fog && <Fog lightsRef={lights} color={song.album.palette.accent} />}
      <Director song={song} choreo={choreo} frameRef={frame} lightsRef={lights} heads={preset.heads} strobeRef={strobe} />
      <Suspense fallback={null}>
        {song.cast.map((c) => (
          <Avatar key={c.avatarId} member={c} song={song} choreo={choreo} frameRef={frame} />
        ))}
        <ReadySignal />
      </Suspense>
      {preset.bloom && (
        <EffectComposer multisampling={0} resolutionScale={quality === "hoch" ? 1 : 0.5}>
          <Bloom mipmapBlur luminanceThreshold={0.7} luminanceSmoothing={0.15} intensity={0.7} />
        </EffectComposer>
      )}
    </Canvas>
      {/* Stroboskop (nur bei Drops, abschaltbar) */}
      <div ref={strobe} className="pointer-events-none absolute inset-0 bg-white opacity-0" aria-hidden />
    </div>
  );
}

/** Berechnet pro Frame Songzeit, Positionen, Fokus (Sänger) und Kamera. Läuft vor den Avataren. */
type DirectorProps = {
  song: SongStatic;
  choreo: Choreography;
  frameRef: React.RefObject<Frame>;
  lightsRef: React.RefObject<LightFrame | null>;
  heads: number;
  strobeRef: React.RefObject<HTMLDivElement | null>;
};

function Director({ song, choreo, frameRef, lightsRef, heads, strobeRef }: DirectorProps) {
  const camera = useThree((s) => s.camera);
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

  useFrame(() => {
    const { positionMs, playback, frozen, derived, live } = songContext.getState();
    const t = positionMs;
    const positions = positionsAt(choreo, t, { timeline, avatarOf });
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
    });
    lightsRef.current = lf;
    if (strobeRef.current) strobeRef.current.style.opacity = String(lf.strobe * 0.55);

    const cam = cameraAt(choreo, t);
    camera.position.set(...cam.pos);
    camera.lookAt(...cam.target);

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

type AvatarProps = { member: CastMember; song: SongStatic; choreo: Choreography; frameRef: React.RefObject<Frame> };

function Avatar(props: AvatarProps) {
  const info = avatarById.get(props.member.avatarId);
  if (!info) return null;
  return <AvatarModel url={info.url} {...props} />;
}

function AvatarModel({ url, member, song, choreo, frameRef }: AvatarProps & { url: string }) {
  const { scene, animations } = useGLTF(url);
  const group = useRef<Group>(null);

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
    }

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
