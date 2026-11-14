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

const Stage = dynamic(() => import("./stage/Stage").then((m) => m.Stage), { ssr: false });

type Props = { demo?: string; t?: number; debug: boolean };

export function Dashboard({ demo, t, debug }: Props) {
  const song = useSongContext((s) => s.song);
  const unknownDemo = demo !== undefined && !fixtures[demo];

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
            <Stage />
          </div>
          {/* Verlauf für Lesbarkeit der Lyrics vor der 3D-Szene */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgb(0_0_0/0.55)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
          <NowPlayingBar />
          <LyricsLayer />
          <Progress />
        </>
      ) : (
        <IdleScreen unknownDemo={unknownDemo ? demo : undefined} />
      )}
      {debug && <DebugPanel />}
    </main>
  );
}
