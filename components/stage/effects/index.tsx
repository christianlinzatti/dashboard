"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Choreography } from "@/lib/dance/plan";
import type { Palette } from "@/lib/song-context/schema";
import { songContext } from "@/lib/song-context/store";
import { manualCue, manualCues } from "@/lib/stage/manual-cues";
import { dropCues, effectsAt, snareFlame, type ActiveCue, type Cue } from "@/lib/stage/effects";
import type { EffectKind, Theme } from "@/lib/stage/themes";
import { Confetti3D, Foam3D, FoamCannons } from "../Effects3D";
import type { Frame } from "../types";
import type { LightFrame } from "@/lib/stage/lights";
import { EMITTERS } from "./emitters";
import { ParticleFx } from "./ParticleFx";
import { BeatRings } from "./BeatRings";
import { MirrorBall } from "./MirrorBall";
export function Effects({
  cues,
  choreo,
  theme,
  palette,
  frameRef,
  lightsRef,
  scale,
}: {
  cues: Cue[];
  choreo: Choreography;
  theme: Theme;
  palette: Palette;
  frameRef: React.RefObject<Frame>;
  lightsRef?: React.RefObject<LightFrame | null>;
  scale: number;
}) {
  const active = useRef<ActiveCue[]>([]);
  const lastKinds = useRef("");
  const drop = useRef<{ at: number | null; cues: Cue[] }>({ at: null, cues: [] });
  // Snare-Flammen (Mikrofon): die letzten Stöße, solange sie noch brennen
  const snare = useRef<{ heard: number | null; cues: Cue[] }>({ heard: null, cues: [] });

  // Aktive Einsätze vor den Emittern bestimmen (Priorität nach dem Director)
  useFrame(({ gl }) => {
    const f = frameRef.current;
    if (f.dropMs !== drop.current.at)
      drop.current = { at: f.dropMs, cues: f.dropMs !== null ? dropCues(f.dropMs, choreo, theme) : [] };
    const heard = f.micActive ? songContext.getState().live.drums.snare : null;
    if (heard !== snare.current.heard) {
      const last = snare.current.cues.at(-1)?.startMs ?? null;
      const q = snareFlame(choreo, theme, heard, last);
      snare.current = { heard, cues: q ? [...snare.current.cues.slice(-2), q] : snare.current.cues };
    }
    // Effekte auf Knopfdruck (Fernbedienung, Alexa) – nur was die Bühne hat
    const manual = manualCues.getState();
    const pressed =
      manual.trackKey === choreo.trackKey
        ? manual.cues.filter((m) => theme.effects.includes(m.kind)).map((m) => manualCue(m.kind, m.songMs, choreo))
        : [];
    active.current = f.playing ? effectsAt(cues, f.t, [...drop.current.cues, ...snare.current.cues, ...pressed]) : [];
    // für Tests und Debug: aktive Effektarten am Canvas
    const kinds = [...new Set(active.current.map((c) => c.kind))].sort().join(",");
    if (kinds !== lastKinds.current) {
      lastKinds.current = kinds;
      gl.domElement.dataset.fx = kinds;
    }
  }, -0.5);

  const has = (k: EffectKind) => theme.effects.includes(k);
  return (
    <group>
      {(Object.keys(EMITTERS) as Array<keyof typeof EMITTERS>).filter(has).map((k) => (
        <ParticleFx key={k} kind={k} activeRef={active} theme={theme} palette={palette} scale={scale} />
      ))}
      {has("konfetti") && <Confetti3D activeRef={active} lightsRef={lightsRef} palette={palette} theme={theme} scale={scale} />}
      {has("schaum") && (
        <>
          <Foam3D activeRef={active} lightsRef={lightsRef} palette={palette} scale={scale} />
          <FoamCannons accent={theme.colors.accent} />
        </>
      )}
      {has("ringe") && <BeatRings activeRef={active} frameRef={frameRef} beatMs={choreo.beatMs} color={palette.accent} />}
      {has("glitzer") && <MirrorBall activeRef={active} frameRef={frameRef} color={theme.fire[0]} />}
    </group>
  );
}
