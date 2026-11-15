"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { planChoreography } from "@/lib/dance/plan";
import { useSettings } from "@/lib/settings";
import type { SongStatic } from "@/lib/song-context/schema";
import { useSongContext } from "@/lib/song-context/store";
import type { LightFrame } from "@/lib/stage/lights";
import { PRESETS, stepQuality, type Quality } from "@/lib/stage/quality";
import { fpsFrom, perf } from "@/lib/stage/perf";
import { ErrorBoundary } from "../ErrorBoundary";
import { Avatar } from "./Avatar";
import { Director } from "./Director";
import { Lasers, MovingHeads } from "./Lights";
import { ReadySignal } from "./ReadySignal";
import { PhotoWall } from "./PhotoWall";
import { LogoWall } from "./LogoWall";
import { wallPhotoAt } from "@/lib/info/display";
import { displayUrl } from "@/lib/info/photos";
import { Fog, StageSet } from "./StageSet";
import { initialFrame, type Frame } from "./types";

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Misst die Bildrate (alle 2 s) für Debug-Panel und Leistungsproben. */
function FpsMeter({ quality }: { quality: Quality }) {
  const times = useRef<number[]>([]);
  const last = useRef(0);
  useFrame((state, dt) => {
    times.current.push(dt);
    if (state.clock.elapsedTime - last.current < 2) return;
    last.current = state.clock.elapsedTime;
    perf.setState({ fps: fpsFrom(times.current), quality });
    times.current = [];
  });
  return null;
}

/** Ersatz ohne 3D (kein WebGL, Grafikfehler): ruhiger Farbverlauf aus der Cover-Palette. */
function Backdrop({ song }: { song: SongStatic | null }) {
  const p = song?.album.palette;
  return (
    <div
      className="absolute inset-0"
      data-testid="stage-fallback"
      style={{
        background: p ? `radial-gradient(ellipse at 50% 35%, ${p.dominant}55 0%, ${p.dark} 65%), ${p.dark}` : "#05030a",
      }}
    />
  );
}

/**
 * 3D-Bühne. Lädt nur die Avatare der aktuellen Besetzung.
 * Robust: ohne WebGL oder bei Fehlern in der Szene erscheint ein 2D-Hintergrund; nach einem
 * Verlust des Grafikkontexts (z. B. GPU-Reset auf dem Pi) wird die Szene neu aufgebaut.
 */
export function Stage({ forceQuality }: { forceQuality?: Quality }) {
  const song = useSongContext((s) => s.song);
  const [webgl] = useState(() => (typeof document === "undefined" ? true : hasWebGL()));
  const [generation, setGeneration] = useState(0);

  if (!webgl) return <Backdrop song={song} />;
  return (
    // Neuer Song oder neuer Grafikkontext → Fehlerzustand zurücksetzen
    <ErrorBoundary key={`${song?.trackKey}:${generation}`} fallback={<Backdrop song={song} />} label="3D-Bühne">
      <Scene forceQuality={forceQuality} onContextLost={() => setTimeout(() => setGeneration((g) => g + 1), 1500)} />
    </ErrorBoundary>
  );
}

function Scene({ forceQuality, onContextLost }: { forceQuality?: Quality; onContextLost: () => void }) {
  const song = useSongContext((s) => s.song);
  const bpm = useSongContext((s) => Math.round(s.live.bpm));
  const frozen = useSongContext((s) => s.frozen);
  const dark = song?.album.palette.dark ?? "#0b0712";

  // Neu planen nur, wenn sich Song, Abschnitte, Besetzung oder Tempo ändern
  const sectionsKey = song?.lyrics?.sections.map((s) => `${s.kind}${s.startMs}`).join() ?? "";
  // gefolgte Artists winken beim Songstart – die Daten kommen kurz nach dem Songwechsel
  const followKey = Object.entries(song?.user?.artists ?? {})
    .filter(([, a]) => a.following)
    .map(([id]) => id)
    .join();
  const choreo = useMemo(
    () => (song ? planChoreography(song, bpm) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bewusst nur bei inhaltlichen Änderungen
    [song?.trackKey, sectionsKey, bpm, song?.cast, followKey],
  );
  const frame = useRef<Frame>(initialFrame);
  const lights = useRef<LightFrame | null>(null);
  const strobe = useRef<HTMLDivElement>(null);

  // Qualität: fest (Einstellung/URL) oder automatisch nach Bildrate; Demos fest „mittel“ (reproduzierbar)
  // Wandfoto wechselt mit jedem Abschnitt (Selektor liefert nur die URL → kein Rerender pro Frame)
  const photoUrl = useSongContext((s) => (s.song ? (wallPhotoAt(s.song, s.positionMs)?.url ?? null) : null));
  const chosen = useSettings((s) => s.quality);
  const [autoQuality, setAutoQuality] = useState<Quality>("mittel");
  const quality: Quality = forceQuality ?? (frozen ? "mittel" : chosen === "auto" ? autoQuality : chosen);
  const preset = PRESETS[quality];

  useEffect(() => () => document.body.removeAttribute("data-stage-ready"), []);

  if (!song || !choreo) return null;
  const logo = song.info?.artists[song.artists[0]?.spotifyId ?? ""]?.logo;

  return (
    <div className="absolute inset-0" data-quality={quality} data-wall-logo={logo ? displayUrl(logo, 640) : undefined}>
      <Canvas
        data-testid="stage"
        dpr={preset.dpr}
        frameloop={frozen ? "demand" : "always"}
        camera={{ position: [0, 1.3, 6.6], fov: 36 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) =>
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            onContextLost();
          })
        }
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
        {!frozen && <FpsMeter quality={quality} />}
        <StageSet preset={preset} dark={dark} lightsRef={lights} />
        <MovingHeads
          key={`h${preset.heads}${preset.realLights}`}
          count={preset.heads}
          realLights={preset.realLights}
          lightsRef={lights}
        />
        <Lasers key={`l${preset.lasers}`} count={preset.lasers} lightsRef={lights} />
        {preset.fog && <Fog lightsRef={lights} color={song.album.palette.accent} />}
        <Director song={song} choreo={choreo} frameRef={frame} lightsRef={lights} heads={preset.heads} strobeRef={strobe} />
        <Suspense fallback={null}>
          {photoUrl && (
            <ErrorBoundary key={photoUrl} fallback={null} label="Wandfoto">
              <PhotoWall
                key={photoUrl}
                url={displayUrl(photoUrl)}
                dark={song.album.palette.dark}
                accent={song.album.palette.accent}
                lightsRef={lights}
              />
            </ErrorBoundary>
          )}
          {logo && (
            <ErrorBoundary key={logo} fallback={null} label="Logo">
              <LogoWall url={displayUrl(logo, 640)} accent={song.album.palette.accent} lightsRef={lights} />
            </ErrorBoundary>
          )}
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
