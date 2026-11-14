"use client";

import dynamic from "next/dynamic";
import { useEffect, type CSSProperties } from "react";
import { fixtures } from "@/lib/song-context/fixtures";
import { songContext, useSongContext } from "@/lib/song-context/store";
import { NowPlayingBar } from "./hud/NowPlayingBar";
import { Progress } from "./hud/Progress";
import { IdleScreen } from "./hud/IdleScreen";
import { LyricsLayer } from "./lyrics/LyricsLayer";
import { DebugPanel } from "./debug/DebugPanel";
import { Controls } from "./hud/Controls";
import { useSpotifySync } from "./spotify/useSpotifySync";
import { useLyricsLoader } from "./lyrics/useLyricsLoader";
import { useMicAnalysis } from "./audio/useMicAnalysis";
import type { LyricsMode } from "@/lib/lyrics/director";
import type { Quality } from "@/lib/stage/quality";

const Stage = dynamic(() => import("./stage/Stage").then((m) => m.Stage), { ssr: false });

type Props = { demo?: string; t?: number; debug: boolean; loginError?: string; mic?: boolean; lyricsMode?: LyricsMode; quality?: Quality };

export function Dashboard({ demo, t, debug, loginError, mic, lyricsMode, quality }: Props) {
  const song = useSongContext((s) => s.song);
  const unknownDemo = demo !== undefined && !fixtures[demo];
  // Ohne Demo: Live-Betrieb mit Spotify
  const status = useSpotifySync(demo === undefined);
  useLyricsLoader(demo === undefined);
  // Mikrofon: im Live-Betrieb; in Demos nur mit ?mic=1 (Screenshots bleiben reproduzierbar)
  const micCtl = useMicAnalysis(demo === undefined || !!mic);

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
      if (!s.frozen) s.tick(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const p = song?.album.palette;
  const vars = (p
    ? { "--c-dominant": p.dominant, "--c-accent": p.accent, "--c-dark": p.dark, "--c-light": p.light }
    : {}) as CSSProperties;

  return (
    <main className="relative h-dvh w-dvw overflow-hidden bg-[var(--c-dark)]" style={vars} data-testid="dashboard">
      {song ? (
        <>
          <div className="absolute inset-0">
            <Stage forceQuality={quality} />
          </div>
          {/* Verlauf für Lesbarkeit der Lyrics vor der 3D-Szene */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(0_0_0/0.55)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <NowPlayingBar />
          <LyricsLayer forceMode={lyricsMode} />
          <Progress />
          <Controls live={demo === undefined} mic={demo === undefined || mic ? micCtl : undefined} />
        </>
      ) : (
        <IdleScreen status={unknownDemo ? { kind: "idle" } : status} unknownDemo={unknownDemo ? demo : undefined} loginError={loginError} />
      )}
      {debug && <DebugPanel />}
    </main>
  );
}
