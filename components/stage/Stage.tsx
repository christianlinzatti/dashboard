"use client";

import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSettings } from "@/lib/settings";
import { useSongContext } from "@/lib/song-context/store";
import type { LightFrame } from "@/lib/stage/lights";
import { PRESETS, stepQuality, type Quality } from "@/lib/stage/quality";
import { SceneLights } from "./SceneLights";
import { Band } from "./Band";
import { hasBlinders, type ThemeId } from "@/lib/stage/themes";
import { ErrorBoundary } from "../ErrorBoundary";
import { Avatar } from "./Avatar";
import { Director, FOG_NEAR } from "./Director";
import { Blinders, Lasers, MovingHeads } from "./Lights";
import { NOT_ON_SCREENS } from "./layout";
import { type DayPhase } from "@/lib/stage/daylight";
import { LiveScreens } from "./LiveScreens";
import { PhotoCapture } from "./PhotoCapture";
import { Weather } from "./Weather";
import { weatherFor } from "@/lib/stage/weather";
import { DEMO_TODAY } from "@/lib/song-context/fixtures";
import { todayLocal } from "@/lib/concerts/display";
import { ReadySignal } from "./ReadySignal";
import { PhotoWall } from "./PhotoWall";
import { chorusKeyword, forcedWallPattern, wallPattern } from "@/lib/stage/wall";
import { LogoWall } from "./LogoWall";
import { wallPhotoAt, wallPhotoCredit } from "@/lib/info/display";
import { displayUrl, wallPhotoWidth } from "@/lib/info/photos";
import { Fog, StageSet, TurntableMarks, WallFrame, wallScale } from "./StageSet";
import { Crowd, CrowdFlags } from "./crowd";
import { Effects } from "./effects";
import { initialFrame, type Frame } from "./types";
import { RenderStats } from "./RenderStats";
import { FpsMeter, hasWebGL, MixamoClips, screenWidth, useDayPhase } from "./scene-parts";
import { Backdrop, StageOverlays } from "./StageOverlays";
import { useStagePlan } from "./useStagePlan";
import { ChorusSign } from "./ChorusSign";
import { CanvasWall, type WallCanvas } from "./CanvasWall";
import { planStaging, RUNWAY_THEMES } from "@/lib/stage/staging";
import type { EveningPhase } from "@/lib/show/evening";
import { Runway } from "./Runway";
import { Hinterland } from "./Hinterland";
import { LiftShaft } from "./LiftShaft";
import { Drones } from "./Drones";
import { FanCamArms } from "./FanCamArms";

/**
 * 3D-Bühne. Lädt nur die Avatare der aktuellen Besetzung.
 * Robust: ohne WebGL oder bei Fehlern in der Szene erscheint ein 2D-Hintergrund; nach einem
 * Verlust des Grafikkontexts (z. B. GPU-Reset auf dem Pi) wird die Szene neu aufgebaut.
 */

/** Bühnen mit Wasserbällen im Refrain (Open Air und große Hallen) */
const BALL_THEMES: readonly string[] = ["festival", "strand", "stadion", "club"];

export function Stage({
  forceQuality,
  forceTheme,
  forceWeather,
  forceDaylight,
  wallCanvas,
  forceEvening,
}: {
  forceQuality?: Quality;
  forceTheme?: ThemeId;
  forceWeather?: "regen" | "schnee" | "aus";
  forceDaylight?: DayPhase;
  /** Spotify Canvas auf der LED-Wand (statt Wandfoto und Logo) */
  wallCanvas?: WallCanvas | null;
  /** Abendphase vorgeben (Demos: ?abend=zugabe) */
  forceEvening?: EveningPhase;
}) {
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
        forceWeather={forceWeather}
        forceDaylight={forceDaylight}
        wallCanvas={wallCanvas}
        forceEvening={forceEvening}
        onContextLost={() => setTimeout(() => setGeneration((g) => g + 1), 1500)}
      />
    </ErrorBoundary>
  );
}

function Scene({
  forceQuality,
  forceTheme,
  forceWeather,
  forceDaylight,
  wallCanvas,
  forceEvening,
  onContextLost,
}: {
  forceQuality?: Quality;
  forceTheme?: ThemeId;
  forceWeather?: "regen" | "schnee" | "aus";
  forceDaylight?: DayPhase;
  wallCanvas?: WallCanvas | null;
  forceEvening?: EveningPhase;
  onContextLost: () => void;
}) {
  const plan = useStagePlan(forceTheme, forceEvening);
  const { raw, theme, song, phase, band, signs, mixamoIds, cues, frozen, dark } = plan;
  // Wetter auf Freiluftbühnen (Regen, Schnee) – Demos rechnen mit festem Datum
  const weather =
    forceWeather === "aus"
      ? null
      : (forceWeather ?? (raw && theme ? weatherFor(raw, theme.id, frozen ? DEMO_TODAY : todayLocal()) : null));
  // Tageszeit der Freiluftbühnen: URL > echte Uhrzeit (minütlich); Demos/Screenshots: gestalteter Himmel
  const clockPhase = useDayPhase(!frozen && !forceDaylight);
  const daylight = forceDaylight ?? (frozen ? undefined : clockPhase);
  // Bühnenbau und große Auftritte (Laufsteg, Hubpodest, Spannungsaufbau, Drohnen) – hängen an Bühne, Abend, Tageszeit
  const staging = useMemo(
    () => (plan.choreo && theme ? planStaging(plan.choreo, theme, phase, daylight) : undefined),
    [plan.choreo, theme, phase, daylight],
  );
  const choreo = useMemo(() => (plan.choreo && staging ? { ...plan.choreo, staging } : plan.choreo), [plan.choreo, staging]);
  const shown = useMemo(() => (plan.shown && staging ? { ...plan.shown, staging } : plan.shown), [plan.shown, staging]);
  const frame = useRef<Frame>(initialFrame);
  const lights = useRef<LightFrame | null>(null);
  const strobe = useRef<HTMLDivElement>(null);
  const blackout = useRef<HTMLDivElement>(null);
  const countdown = useRef<HTMLDivElement>(null);
  const glare = useRef<HTMLDivElement>(null);

  // Qualität: fest (Einstellung/URL) oder automatisch nach Bildrate; Demos fest „mittel“ (reproduzierbar)
  // Wandfoto wechselt mit jedem Abschnitt (Selektor liefert nur die URL → kein Rerender pro Frame)
  const photoUrl = useSongContext((s) => (s.song ? (wallPhotoAt(s.song, s.positionMs)?.url ?? null) : null));
  const photoCredit = useSongContext((s) => (s.song ? wallPhotoCredit(s.song, s.positionMs) : null));
  const chosen = useSettings((s) => s.quality);
  const [autoQuality, setAutoQuality] = useState<Quality>("mittel");
  const quality: Quality = forceQuality ?? (frozen ? "mittel" : chosen === "auto" ? autoQuality : chosen);
  const preset = PRESETS[quality];

  useEffect(() => () => document.body.removeAttribute("data-stage-ready"), []);

  if (!song || !choreo || !theme) return null;
  const crowdCount = Math.round(preset.crowd * theme.crowd);
  const runway = RUNWAY_THEMES.includes(theme.id);
  const logo = song.info?.artists[song.artists[0]?.spotifyId ?? ""]?.logo;
  // Canvas nur auf Bühnen mit LED-Wand; dann ohne Wandfoto und Logo
  const onWall = theme.wall === "led" && wallCanvas ? wallCanvas : null;

  return (
    <div
      className="absolute inset-0"
      data-quality={quality}
      data-theme={theme.id}
      data-outfits={song.cast.map((c) => c.outfit ?? "original").join(",")}
      data-cast={song.cast.map((c) => c.avatarId).join(",")}
      data-weather={weather ?? "kein"}
      data-daylight={daylight ?? "gestaltet"}
      data-evening={phase}
      data-wall-logo={logo && theme.wall === "led" ? displayUrl(logo, 640) : undefined}
      data-wall={theme.wall === "led" ? (forcedWallPattern() ?? wallPattern(song)) : undefined}
      data-wall-word={theme.wall === "led" ? (chorusKeyword(song.lyrics) ?? undefined) : undefined}
      data-wall-canvas={onWall ? onWall.kind : undefined}
    >
      <Canvas
        data-testid="stage"
        dpr={preset.dpr}
        frameloop={frozen ? "demand" : "always"}
        camera={{ position: [0, 2.2, 10.2], fov: 24 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl, camera }) => {
          // Hauptkamera sieht auch die Feinheiten, die die Live-Bildschirme auslassen
          camera.layers.enable(NOT_ON_SCREENS);
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            onContextLost();
          });
        }}
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
          daylight={daylight}
        />
        <TurntableMarks frameRef={frame} color={song.album.palette.accent} />
        {runway && <Runway dark={dark} accent={song.album.palette.accent} frameRef={frame} lightsRef={lights} />}
        {runway && quality !== "niedrig" && <Hinterland dark={dark} accent={song.album.palette.accent} lightsRef={lights} />}
        {choreo.staging?.lift && <LiftShaft choreo={choreo} frameRef={frame} color={song.album.palette.accent} />}
        {choreo.staging?.drones && (
          <Drones
            choreo={choreo}
            frameRef={frame}
            word={chorusKeyword(song.lyrics) ?? song.artists[0]?.name ?? "Live"}
            colors={[song.album.palette.accent, song.album.palette.dominant]}
            scale={preset.particles}
          />
        )}
        {crowdCount > 0 && <FanCamArms choreo={choreo} frameRef={frame} dark={dark} accent={song.album.palette.accent} />}
        {crowdCount > 0 && (
          <Crowd
            key={`publikum-${theme.id}`}
            count={crowdCount}
            choreo={shown ?? choreo}
            theme={theme}
            dark={dark}
            accent={song.album.palette.accent}
            frameRef={frame}
            lightsRef={lights}
            signs={quality !== "niedrig" ? signs : undefined}
            runway={runway}
            balls={BALL_THEMES.includes(theme.id)}
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
        {hasBlinders(theme) && <Blinders lightsRef={lights} />}
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
          glareRef={hasBlinders(theme) ? glare : undefined}
          theme={theme}
          band={quality !== "niedrig" ? band : null}
        />
        {weather && <Weather kind={weather} frameRef={frame} lightsRef={lights} scale={preset.particles} />}
        <Effects
          key={`effekte-${theme.id}`}
          cues={cues}
          choreo={choreo}
          theme={theme}
          palette={song.album.palette}
          frameRef={frame}
          lightsRef={lights}
          scale={preset.particles}
        />
        <ChorusSign song={song} accent={song.album.palette.accent} />
        <Suspense fallback={null}>
          {theme.wall === "led" && (
            <WallFrame scale={wallScale(theme)}>
              {onWall && (
                <ErrorBoundary key={onWall.url} fallback={null} label="Canvas">
                  <CanvasWall canvas={onWall} lightsRef={lights} />
                </ErrorBoundary>
              )}
              {photoUrl && !onWall && (
                <ErrorBoundary key={photoUrl} fallback={null} label="Wandfoto">
                  <PhotoWall
                    key={photoUrl}
                    url={displayUrl(photoUrl, wallPhotoWidth(quality, screenWidth()))}
                    dark={song.album.palette.dark}
                    accent={song.album.palette.accent}
                    lightsRef={lights}
                  />
                </ErrorBoundary>
              )}
              {logo && !onWall && (
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
          <RenderStats />
        </Suspense>
        {/* Erinnerungsfoto: liest das fertige Bild (nach Bloom) */}
        <PhotoCapture bloom={preset.bloom} />
        {preset.bloom && (
          <EffectComposer multisampling={0} resolutionScale={quality === "hoch" ? 1 : 0.5}>
            <Bloom mipmapBlur luminanceThreshold={0.7} luminanceSmoothing={0.15} intensity={0.7} />
          </EffectComposer>
        )}
      </Canvas>
      <StageOverlays
        refs={{ strobe, glare, blackout, countdown }}
        accent={song.album.palette.accent}
        photoCredit={theme.wall === "led" && photoUrl && !onWall ? photoCredit : null}
        singAlong={choreo.singAlong}
      />
    </div>
  );
}
