"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { loadMixamo, mixamoIdsIn } from "@/lib/dance/mixamo-loader";
import { planChoreography } from "@/lib/dance/plan";
import { useSettings } from "@/lib/settings";
import type { SongStatic } from "@/lib/song-context/schema";
import { useSongContext } from "@/lib/song-context/store";
import type { LightFrame } from "@/lib/stage/lights";
import { PRESETS, stepQuality, type Quality } from "@/lib/stage/quality";
import { planEffects } from "@/lib/stage/effects";
import { SceneLights } from "./SceneLights";
import { Band } from "./Band";
import { planBand } from "@/lib/stage/band";
import { avatars } from "@/lib/avatars/catalog";
import { setlistStore, usePreviousTheme, useRecentClipsKey } from "@/lib/stage/setlist";
import { THEMES, themedPalette, themeFor, type Theme, type ThemeId } from "@/lib/stage/themes";
import { fpsFrom, perf } from "@/lib/stage/perf";
import { ErrorBoundary } from "../ErrorBoundary";
import { Avatar } from "./Avatar";
import { Director, FOG_NEAR } from "./Director";
import { Blinders, Lasers, MovingHeads } from "./Lights";
import { LiveScreens } from "./LiveScreens";
import { ReadySignal } from "./ReadySignal";
import { PhotoWall } from "./PhotoWall";
import { LogoWall } from "./LogoWall";
import { wallPhotoAt } from "@/lib/info/display";
import { displayUrl } from "@/lib/info/photos";
import { Fog, StageSet, TurntableMarks, WallFrame, wallScale } from "./StageSet";
import { Crowd, CrowdFlags } from "./Crowd";
import { Effects } from "./Effects";
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
export function Stage({ forceQuality, forceTheme }: { forceQuality?: Quality; forceTheme?: ThemeId }) {
  const song = useSongContext((s) => s.song);
  const [webgl] = useState(() => (typeof document === "undefined" ? true : hasWebGL()));
  const [generation, setGeneration] = useState(0);

  if (!webgl) return <Backdrop song={song} />;
  return (
    // Neuer Song oder neuer Grafikkontext → Fehlerzustand zurücksetzen
    <ErrorBoundary key={`${song?.trackKey}:${generation}`} fallback={<Backdrop song={song} />} label="3D-Bühne">
      <Scene
        forceQuality={forceQuality}
        forceTheme={forceTheme}
        onContextLost={() => setTimeout(() => setGeneration((g) => g + 1), 1500)}
      />
    </ErrorBoundary>
  );
}

function Scene({
  forceQuality,
  forceTheme,
  onContextLost,
}: {
  forceQuality?: Quality;
  forceTheme?: ThemeId;
  onContextLost: () => void;
}) {
  const raw = useSongContext((s) => s.song);
  // Bühnen-Thema: URL > Einstellung > Genre/Track; die Cover-Palette wird in Richtung Thema verschoben
  const themeChoice = useSettings((s) => s.stage);
  // Gedächtnis des Abends: Bühne des vorigen Songs meiden, Tänze der letzten Songs seltener
  const prevTheme = usePreviousTheme(raw?.trackKey);
  const recentKey = useRecentClipsKey(raw?.trackKey);
  const theme: Theme | null = raw ? THEMES[forceTheme ?? themeFor(raw, themeChoice, prevTheme)] : null;
  const song = useMemo(
    () => (raw && theme?.tint ? { ...raw, album: { ...raw.album, palette: themedPalette(raw.album.palette, theme) } } : raw),
    [raw, theme],
  );
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
  // Regie (Genres, Stimmung, KI-Brief, Tagesform) kommt kurz nach dem Songwechsel
  const showKey = `${raw?.variant}|${raw?.music.mood}|${raw?.music.genres.join()}|${raw?.show?.motto}`;
  const choreo = useMemo(
    () => (raw ? planChoreography(raw, bpm, { avoidClips: new Set(recentKey ? recentKey.split(",") : []) }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bewusst nur bei inhaltlichen Änderungen
    [raw?.trackKey, sectionsKey, bpm, raw?.cast, followKey, showKey, recentKey],
  );
  // diesen Song fürs Gedächtnis des Abends festhalten (Bühne + getanzte Clips)
  useEffect(() => {
    if (!choreo || !theme) return;
    const clips = [...new Set(choreo.phrases.flatMap((p) => Object.values(p.moves).map((m) => m.clip)))];
    setlistStore.getState().record({ trackKey: choreo.trackKey, theme: theme.id, clips });
  }, [choreo, theme]);
  // Band hinten (DJ / Rock / Keys nach Genre) – nicht auf der niedrigsten Qualitätsstufe
  const band = useMemo(
    () =>
      raw
        ? planBand(
            raw,
            avatars.map((a) => a.id),
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei Song, Besetzung oder Regie neu
    [raw?.trackKey, raw?.cast, showKey],
  );
  const mixamoIds = useMemo(
    () => [
      ...new Set([
        ...(choreo ? mixamoIdsIn(choreo) : []),
        ...(band?.members.map((m) => m.clip).filter((c) => c.startsWith("Mixamo_")) ?? []),
      ]),
    ],
    [choreo, band],
  );
  const cues = useMemo(() => (choreo && theme ? planEffects(choreo, theme) : []), [choreo, theme]);
  const frame = useRef<Frame>(initialFrame);
  const lights = useRef<LightFrame | null>(null);
  const strobe = useRef<HTMLDivElement>(null);
  const blackout = useRef<HTMLDivElement>(null);
  const countdown = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);

  // Qualität: fest (Einstellung/URL) oder automatisch nach Bildrate; Demos fest „mittel“ (reproduzierbar)
  // Wandfoto wechselt mit jedem Abschnitt (Selektor liefert nur die URL → kein Rerender pro Frame)
  const photoUrl = useSongContext((s) => (s.song ? (wallPhotoAt(s.song, s.positionMs)?.url ?? null) : null));
  const chosen = useSettings((s) => s.quality);
  const [autoQuality, setAutoQuality] = useState<Quality>("mittel");
  const quality: Quality = forceQuality ?? (frozen ? "mittel" : chosen === "auto" ? autoQuality : chosen);
  const preset = PRESETS[quality];

  useEffect(() => () => document.body.removeAttribute("data-stage-ready"), []);

  if (!song || !choreo || !theme) return null;
  const crowdCount = Math.round(preset.crowd * theme.crowd);
  const logo = song.info?.artists[song.artists[0]?.spotifyId ?? ""]?.logo;

  return (
    <div
      className="absolute inset-0"
      data-quality={quality}
      data-theme={theme.id}
      data-outfits={song.cast.map((c) => c.outfit ?? "original").join(",")}
      data-wall-logo={logo && theme.wall === "led" ? displayUrl(logo, 640) : undefined}
    >
      <Canvas
        data-testid="stage"
        dpr={preset.dpr}
        frameloop={frozen ? "demand" : "always"}
        camera={{ position: [0, 2.2, 10.2], fov: 24 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) =>
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            onContextLost();
          })
        }
      >
        <color attach="background" args={[dark]} />
        <fog attach="fog" args={[dark, FOG_NEAR, theme.fogFar]} />
        <SceneLights lightsRef={lights} ground={dark} />
        {!frozen && chosen === "auto" && !forceQuality && (
          <PerformanceMonitor
            onDecline={() => setAutoQuality((q) => stepQuality(q, -1))}
            onIncline={() => setAutoQuality((q) => stepQuality(q, 1))}
            flipflops={3}
          />
        )}
        {!frozen && <FpsMeter quality={quality} />}
        <StageSet
          preset={preset}
          dark={dark}
          accent={song.album.palette.accent}
          theme={theme}
          beatMs={choreo.beatMs}
          lightsRef={lights}
        />
        <TurntableMarks frameRef={frame} color={song.album.palette.accent} />
        {crowdCount > 0 && (
          <Crowd
            key={theme.id}
            count={crowdCount}
            choreo={choreo}
            theme={theme}
            dark={dark}
            accent={song.album.palette.accent}
            frameRef={frame}
            lightsRef={lights}
          />
        )}
        {crowdCount > 0 && theme.id === "festival" && (
          <CrowdFlags colors={[song.album.palette.accent, song.album.palette.dominant]} frameRef={frame} lightsRef={lights} />
        )}
        <MovingHeads
          key={`h${preset.heads}${preset.realLights}`}
          count={preset.heads}
          realLights={preset.realLights}
          dust={preset.fog}
          lightsRef={lights}
        />
        {(theme.truss === "club" || theme.truss === "dach") && <Blinders lightsRef={lights} />}
        {theme.lasers && <Lasers key={`l${preset.lasers}`} count={preset.lasers} lightsRef={lights} />}
        {preset.fog && <Fog lightsRef={lights} color={song.album.palette.accent} />}
        <Director
          song={song}
          choreo={choreo}
          frameRef={frame}
          lightsRef={lights}
          heads={preset.heads}
          strobeRef={strobe}
          blackoutRef={blackout}
          countdownRef={countdown}
          glareRef={theme.truss === "club" || theme.truss === "dach" ? glare : undefined}
          theme={theme}
        />
        <Effects
          key={theme.id}
          cues={cues}
          choreo={choreo}
          theme={theme}
          palette={song.album.palette}
          frameRef={frame}
          lightsRef={lights}
          scale={preset.particles}
        />
        <Suspense fallback={null}>
          {theme.wall === "led" && (
            <WallFrame scale={wallScale(theme)}>
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
              {preset.liveScreens && (
                <LiveScreens
                  choreo={choreo}
                  frameRef={frame}
                  lightsRef={lights}
                  accent={song.album.palette.accent}
                  width={preset.liveScreens.width}
                  every={preset.liveScreens.every}
                />
              )}
            </WallFrame>
          )}
          {song.cast.map((c) => (
            <Avatar key={c.avatarId} member={c} song={song} choreo={choreo} frameRef={frame} />
          ))}
          {band && quality !== "niedrig" && (
            <Band band={band} song={song} choreo={choreo} frameRef={frame} accent={song.album.palette.accent} />
          )}
          <MixamoClips ids={mixamoIds} />
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
      {/* Blinder strahlen beim Einsatz warm in die Kamera */}
      <div
        ref={glare}
        className="pointer-events-none absolute inset-0 opacity-0 mix-blend-screen"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 50% 0%, rgba(255,190,110,0.85), rgba(255,150,70,0.25) 55%, rgba(0,0,0,0) 80%)",
        }}
        aria-hidden
      />
      {/* Blackout vor einem großen Einsatz: Raum dunkel, Lichtkegel in der Mitte, Countdown 4-3-2-1 */}
      <div
        ref={blackout}
        className="pointer-events-none absolute inset-0 opacity-0"
        style={{ background: "radial-gradient(ellipse 38% 55% at 50% 52%, rgba(0,0,0,0.25), rgba(0,0,0,0.92) 75%)" }}
        aria-hidden
      />
      <div
        ref={countdown}
        data-testid="countdown"
        className="pointer-events-none absolute inset-x-0 top-[12%] text-center font-black leading-none opacity-0"
        style={{
          fontSize: "min(28vh, 22vw)",
          color: song?.album.palette.accent ?? "#ff4fd8",
          textShadow: `0 0 0.18em ${song?.album.palette.accent ?? "#ff4fd8"}`,
        }}
        aria-hidden
      />
    </div>
  );
}

/** Lädt die Mixamo-Clips des Songs (Suspense: Screenshots warten darauf). */
function MixamoClips({ ids }: { ids: string[] }) {
  use(loadMixamo(ids));
  return null;
}
