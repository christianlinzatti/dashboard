"use client";

import { useEffect } from "react";
import type { SongMemory } from "@/lib/song-memory/memory";
import { songContext } from "@/lib/song-context/store";
import { offsetStore } from "@/lib/lyrics/offset-store";
import { ENERGY_BIN_MS, MAX_ENERGY_BINS } from "@/lib/song-memory/energy-sections";

/** Energieverlauf nur melden, wenn so viel vom Song gemessen wurde (sonst taugt er nicht für Abschnitte) */
const MIN_ENERGY_COVERAGE = 0.6;

function energyCurve(c: { durationMs: number; sum: number[]; count: number[] }): number[] | undefined {
  const bins = Math.min(MAX_ENERGY_BINS, Math.ceil(c.durationMs / ENERGY_BIN_MS));
  if (!bins) return undefined;
  const filled = c.count.filter((n) => n > 0).length;
  if (filled < bins * MIN_ENERGY_COVERAGE) return undefined;
  // Lücken (z. B. kurz pausiert) mit dem letzten Wert füllen
  let last = 0;
  return Array.from({ length: bins }, (_, i) => {
    if (c.count[i]) last = Math.round((c.sum[i]! / c.count[i]!) * 100);
    return Math.max(0, Math.min(100, last));
  });
}

/** Kürzer als das nicht melden (kurz reingehört und weitergeskippt) */
const MIN_LISTEN_MS = 45_000;

/**
 * Song-Gedächtnis im Kiosk: lädt beim Songwechsel, was das Mikrofon früher über den Song gemessen hat (Drops,
 * Tempo), und meldet nach dem Song, was diesmal gemessen wurde – nur mit Mikrofon und nur bei echtem Zuhören.
 */
export function useSongMemory(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let current: {
      trackKey: string;
      drops: number[];
      bpm?: number;
      since: number;
      mic: boolean;
      durationMs: number;
      /** Energie je ENERGY_BIN_MS: Summe und Zahl der Werte */
      sum: number[];
      count: number[];
    } | null = null;
    let ctrl: AbortController | undefined;

    const flush = (beacon = false) => {
      const c = current;
      current = null;
      // Lyrics-Versatz: in diesem Abspielen sicher geschätzt?
      const m = offsetStore.getState().measured;
      const shift = c && m && m.trackKey === c.trackKey ? m.song : undefined;
      if (
        !c ||
        !c.mic ||
        (!c.drops.length && !c.bpm && shift === undefined && !c.count.length) ||
        Date.now() - c.since < MIN_LISTEN_MS
      )
        return;
      const energy = energyCurve(c);
      const body = JSON.stringify({
        trackKey: c.trackKey,
        drops: c.drops.map(Math.round),
        ...(c.bpm ? { bpm: c.bpm } : {}),
        ...(shift !== undefined ? { lyricsShiftMs: shift } : {}),
        ...(energy ? { energy } : {}),
      });
      if (beacon && navigator.sendBeacon)
        navigator.sendBeacon("/api/song-memory", new Blob([body], { type: "application/json" }));
      else
        void fetch("/api/song-memory", { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(
          () => undefined,
        );
    };

    const load = async (trackKey: string) => {
      ctrl?.abort();
      ctrl = new AbortController();
      try {
        const r = await fetch(`/api/song-memory?track=${encodeURIComponent(trackKey)}`, { signal: ctrl.signal });
        if (!r.ok) return;
        const { memory } = (await r.json()) as { memory: SongMemory | null };
        const s = songContext.getState();
        if (!memory || s.song?.trackKey !== trackKey) return;
        // gemessenes Tempo ist genauer als der Startwert aus dem Netz
        const music = memory.bpm ? { ...s.song.music, bpmHint: memory.bpm } : s.song.music;
        s.mergeSong({ memory, music });
        if (memory.bpm && !s.live.tempoLocked) s.setLive({ bpm: memory.bpm });
      } catch {
        /* Gedächtnis ist optional */
      }
    };

    const unsubTrack = songContext.subscribe(
      (s) => s.song?.trackKey,
      (key) => {
        flush();
        if (!key) return;
        current = {
          trackKey: key,
          drops: [],
          since: Date.now(),
          mic: songContext.getState().live.micActive,
          durationMs: songContext.getState().song?.track.durationMs ?? 0,
          sum: [],
          count: [],
        };
        void load(key);
      },
      { fireImmediately: true },
    );
    const offDrop = songContext.events.on("drop", ({ songMs }) => {
      if (current) {
        current.drops.push(songMs);
        current.mic = true;
      }
    });
    const offTempo = songContext.events.on("tempoLocked", ({ bpm }) => {
      if (current) {
        current.bpm = Math.round(bpm * 10) / 10;
        current.mic = true;
      }
    });
    // Energieverlauf: mit Mikrofon je 2 s mitteln (für Abschnitte bei Songs ohne Lyrics)
    const offEnergy = songContext.subscribe(
      (s) => s.live.energy,
      (energy) => {
        const s = songContext.getState();
        if (!current || !s.live.micActive || !s.playback.isPlaying || s.song?.trackKey !== current.trackKey) return;
        const bin = Math.floor(s.positionMs / ENERGY_BIN_MS);
        if (bin < 0 || bin >= MAX_ENERGY_BINS) return;
        current.sum[bin] = (current.sum[bin] ?? 0) + energy;
        current.count[bin] = (current.count[bin] ?? 0) + 1;
        current.mic = true;
      },
    );
    const onHide = () => flush(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      unsubTrack();
      offDrop();
      offTempo();
      offEnergy();
      window.removeEventListener("pagehide", onHide);
      ctrl?.abort();
    };
  }, [enabled]);
}
