"use client";

import { MottoBanner } from "./hud/MottoBanner";
import { useEveningTracker } from "./live/useEveningTracker";
import { SongTransition, type TransitionKind } from "./hud/SongTransition";
import dynamic from "next/dynamic";
import { useEffect, type CSSProperties } from "react";
import { fixtures } from "@/lib/song-context/fixtures";
import { songContext, useSongContext } from "@/lib/song-context/store";
import { NowPlayingBar } from "./hud/NowPlayingBar";
import { Progress } from "./hud/Progress";
import { IdleScreen } from "./hud/IdleScreen";
import { QuietHoursOverlay } from "./live/QuietHours";
import type { QuietHours } from "@/lib/live/quiet-hours";
import { LyricsLayer } from "./lyrics/LyricsLayer";
import { DebugPanel } from "./debug/DebugPanel";
import { Controls } from "./hud/Controls";
import { useSpotifySync } from "./spotify/useSpotifySync";
import { settings } from "@/lib/settings";
import { useSnapshotReporter } from "./live/useSnapshotReporter";
import { useBridge } from "./bridge/useBridge";
import { useInfoLoader } from "./info/useInfoLoader";
import { InfoOverlay } from "./info/InfoOverlay";
import { useUserLoader } from "./personal/useUserLoader";
import { ConcertOverlay } from "./concerts/ConcertOverlay";
import { useConcertLoader } from "./concerts/useConcertLoader";
import { useTempoLoader } from "./audio/useTempoLoader";
import { useShowLoader } from "./show/useShowLoader";
import { useArtistAvatars } from "./avatars/useArtistAvatars";
import { useSongMemory } from "./memory/useSongMemory";
import { useAutoOffset } from "./lyrics/useAutoOffset";
import { installTelemetry, report } from "@/lib/live/telemetry";
import { perf } from "@/lib/stage/perf";
import { markFrame } from "@/lib/live/frame-clock";
import { useLyricsLoader } from "./lyrics/useLyricsLoader";
import { useMicAnalysis } from "./audio/useMicAnalysis";
import type { LyricsEffect, LyricsMode } from "@/lib/lyrics/director";
import type { Quality } from "@/lib/stage/quality";
import type { ThemeId } from "@/lib/stage/themes";

const Stage = dynamic(() => import("./stage/Stage").then((m) => m.Stage), { ssr: false });

type Props = {
  demo?: string;
  t?: number;
  debug: boolean;
  loginError?: string;
  mic?: boolean;
  lyricsMode?: LyricsMode;
  /** Schrift-Effekt der Lyrics fest vorgeben (URL ?effekt=…) */
  lyricsEffect?: LyricsEffect;
  quality?: Quality;
  /** Bühnen-Thema fest vorgeben (URL ?buehne=…, z. B. für Screenshots) */
  theme?: ThemeId;
  /** Wetter erzwingen (URL `?wetter=`): Demos und Tests */
  weather?: "regen" | "schnee" | "aus";
  /** Übergang zwischen Songs dauerhaft zeigen (URL `?uebergang=`): Demos und Tests */
  transition?: TransitionKind;
  /** Ruhezeit vorgeben (URL `?ruhe=23:00-07:00`): Demos und Tests */
  quietHours?: QuietHours;
};

export function Dashboard({
  demo,
  t,
  debug,
  loginError,
  mic,
  lyricsMode,
  lyricsEffect,
  quality,
  theme,
  weather,
  transition,
  quietHours,
}: Props) {
  const song = useSongContext((s) => s.song);
  const frozen = useSongContext((s) => s.frozen);
  const unknownDemo = demo !== undefined && !fixtures[demo];
  // Ohne Demo: Live-Betrieb mit Spotify
  const status = useSpotifySync(demo === undefined);
  useLyricsLoader(demo === undefined);
  // Stand an den Server melden (Alexa, Pi-Bridge) und Befehle abholen
  useSnapshotReporter(demo === undefined);
  // Lichtszene an die Pi-Bridge (Govee-Lampen); in Demos aus
  useBridge(demo === undefined);
  // Band-Infos und Fotos (MusicBrainz, Wikipedia, Commons)
  useInfoLoader(demo === undefined);
  // Likes, Follows, Hörstatistik (Spotify, Last.fm)
  useUserLoader(demo === undefined);
  // Bevorstehende Konzerte (Ticketmaster, Bandsintown) und letzte Setlist (setlist.fm)
  useConcertLoader(demo === undefined);
  // Tempo-Startwert (Deezer), bis das Mikrofon eingerastet ist
  useTempoLoader(demo === undefined);
  // Regie: Genres/Stimmung aus offenen Quellen und – wenn eingerichtet – die Regieanweisung der KI
  useShowLoader(demo === undefined);
  // eigene Avatare je Künstler (Einstellungen)
  useArtistAvatars(demo === undefined);
  // Song-Gedächtnis: früher gemessene Drops und Tempo laden, neue Messungen melden
  useSongMemory(demo === undefined);
  // Lyrics-Versatz: von Hand (Steuerleiste) + automatisch über das Mikrofon (Lautsprecher-Verzögerung, Songversion)
  useAutoOffset(demo === undefined);
  // Mikrofon: im Live-Betrieb; in Demos nur mit ?mic=1 (Screenshots bleiben reproduzierbar)
  const micCtl = useMicAnalysis(demo === undefined || !!mic);

  // Fehler und Leistungsproben an den Server melden (nur Live-Betrieb, nicht in Demos/Tests)
  useEffect(() => {
    if (demo !== undefined) return;
    const uninstall = installTelemetry();
    const sample = setInterval(() => {
      const { fps, quality } = perf.getState();
      if (fps !== null && songContext.getState().playback.isPlaying)
        report("info", "leistung", `${fps} fps, Qualität ${quality}, ${window.innerWidth}×${window.innerHeight}`);
    }, 5 * 60_000);
    return () => {
      uninstall();
      clearInterval(sample);
    };
  }, [demo]);

  // Geräte-Einstellungen (Qualität, Strobe) einmalig aus dem Browser laden
  useEffect(() => settings.getState().hydrate(), []);

  // Demo-Modus: Song-Kontext aus Fixture laden; mit ?t=<ms> eingefroren (Screenshots).
  useEffect(() => {
    if (!demo) return;
    const fx = fixtures[demo];
    if (!fx) return;
    const s = songContext.getState();
    s.setSong(fx);
    s.setFrozen(t !== undefined);
    s.setPlayback({ isPlaying: t === undefined, positionMs: t ?? 0, updatedAt: performance.now() });
    s.setLive({ bpm: fx.music.bpmHint ?? 120 });
    s.tick(performance.now());
  }, [demo, t]);

  // Frame-Schleife: Songzeit und abgeleitete Werte aktualisieren.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const s = songContext.getState();
      markFrame();
      if (!s.frozen) s.tick(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Spannungsbogen des Abends aufzeichnen (Zugabe, Höhepunkt …) – unabhängig von der 3D-Bühne
  useEveningTracker();

  const p = song?.album.palette;
  const vars = (
    p ? { "--c-dominant": p.dominant, "--c-accent": p.accent, "--c-dark": p.dark, "--c-light": p.light } : {}
  ) as CSSProperties;

  return (
    <main
      className="relative h-dvh w-dvw overflow-hidden bg-[var(--c-dark)]"
      style={vars}
      data-testid="dashboard"
      data-frozen={frozen}
    >
      {song ? (
        <>
          <div className="absolute inset-0">
            <Stage forceQuality={quality} forceTheme={theme} forceWeather={weather} />
          </div>
          {/* Verlauf für Lesbarkeit der Lyrics vor der 3D-Szene */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(0_0_0/0.55)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <NowPlayingBar />
          <InfoOverlay />
          <ConcertOverlay />
          <MottoBanner />
          <LyricsLayer forceMode={lyricsMode} forceEffect={lyricsEffect} forceTheme={theme} />
          <Progress />
          <SongTransition force={transition} />
          <Controls live={demo === undefined} mic={demo === undefined || mic ? micCtl : undefined} />
        </>
      ) : (
        <IdleScreen
          status={unknownDemo ? { kind: "idle" } : status}
          unknownDemo={unknownDemo ? demo : undefined}
          loginError={loginError}
        />
      )}
      <QuietHoursOverlay enabled={demo === undefined} forced={quietHours} />
      {debug && <DebugPanel />}
    </main>
  );
}
