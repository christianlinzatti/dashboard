"use client";

import { useEffect, useState } from "react";
import { songContext } from "@/lib/song-context/store";
import { extractPalette } from "@/lib/palette/extract";
import { applyNowPlaying } from "@/lib/spotify/sync";
import { pollDelay } from "@/lib/spotify/clock";
import type { NowPlaying } from "@/lib/spotify/types";

export type SpotifyStatus =
  | { kind: "loading" }
  | { kind: "login" }
  | { kind: "unconfigured" }
  | { kind: "idle"; user?: string }
  | { kind: "unsupported"; type: string }
  | { kind: "active"; user?: string }
  | { kind: "error"; message: string };

/** Event, um sofort neu abzufragen (z. B. nach Play/Pause über die Steuerleiste). */
export const POLL_NOW_EVENT = "ss:poll-now";

/** Hält den Song-Kontext mit Spotify synchron (Polling + lokale Interpolation). */
export function useSpotifySync(enabled: boolean): SpotifyStatus {
  const [status, setStatus] = useState<SpotifyStatus>({ kind: "loading" });

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let inFlight = false;
    /** „sofort abfragen“, während noch eine Abfrage läuft: danach direkt nachholen statt verwerfen */
    let again = false;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(poll, ms);
    };

    async function poll() {
      if (stopped) return;
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      try {
        const t0 = performance.now();
        const res = await fetch("/api/now-playing", { cache: "no-store" });
        const t1 = performance.now();
        if (res.status === 401) return setStatus({ kind: "login" });
        if (res.status === 503) return setStatus({ kind: "unconfigured" });
        const body = await res.json().catch(() => ({}));
        if (res.status === 429) return schedule((Number(body.retryAfter) || 5) * 1000);
        if (!res.ok) {
          setStatus({ kind: "error", message: body.error ?? "Spotify ist gerade nicht erreichbar." });
          return schedule(5000);
        }

        const np = body as NowPlaying & { user?: string };
        const { newTrack } = applyNowPlaying(songContext, np, t1 - t0, t1);
        if (np.state === "idle") setStatus({ kind: "idle", user: np.user });
        else if (np.state === "unsupported") setStatus({ kind: "unsupported", type: np.type });
        else setStatus({ kind: "active", user: np.user });

        if (newTrack) void loadPalette();

        const s = songContext.getState();
        const remaining = s.song ? s.song.track.durationMs - s.positionMs : Infinity;
        schedule(pollDelay({ isPlaying: s.playback.isPlaying, remainingMs: remaining }));
      } catch {
        setStatus({ kind: "error", message: "Keine Verbindung zum Server." });
        schedule(5000);
      } finally {
        inFlight = false;
        if (again) {
          again = false;
          schedule(0);
        }
      }
    }

    async function loadPalette() {
      const song = songContext.getState().song;
      if (!song) return;
      const palette = await extractPalette(song.album.coverUrl);
      const now = songContext.getState().song;
      if (!now || now.trackKey !== song.trackKey) return; // Song hat inzwischen gewechselt
      songContext.getState().mergeSong({
        album: { ...now.album, palette: palette ?? now.album.palette },
        status: { palette: palette ? { state: "ok", provider: "cover" } : { state: "error", detail: "Cover nicht lesbar" } },
      });
    }

    const pollNow = () => schedule(0);
    const onVisible = () => document.visibilityState === "visible" && pollNow();
    window.addEventListener(POLL_NOW_EVENT, pollNow);
    document.addEventListener("visibilitychange", onVisible);
    void poll();

    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener(POLL_NOW_EVENT, pollNow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return status;
}
