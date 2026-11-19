"use client";

import { useEffect } from "react";
import type { SongMemory } from "@/lib/song-memory/memory";
import { songContext } from "@/lib/song-context/store";

/** Kürzer als das nicht melden (kurz reingehört und weitergeskippt) */
const MIN_LISTEN_MS = 45_000;

/**
 * Song-Gedächtnis im Kiosk: lädt beim Songwechsel, was das Mikrofon früher über den Song gemessen hat (Drops,
 * Tempo), und meldet nach dem Song, was diesmal gemessen wurde – nur mit Mikrofon und nur bei echtem Zuhören.
 */
export function useSongMemory(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let current: { trackKey: string; drops: number[]; bpm?: number; since: number; mic: boolean } | null = null;
    let ctrl: AbortController | undefined;

    const flush = (beacon = false) => {
      const c = current;
      current = null;
      if (!c || !c.mic || (!c.drops.length && !c.bpm) || Date.now() - c.since < MIN_LISTEN_MS) return;
      const body = JSON.stringify({ trackKey: c.trackKey, drops: c.drops.map(Math.round), ...(c.bpm ? { bpm: c.bpm } : {}) });
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
        current = { trackKey: key, drops: [], since: Date.now(), mic: songContext.getState().live.micActive };
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
    const onHide = () => flush(true);
    window.addEventListener("pagehide", onHide);
    return () => {
      unsubTrack();
      offDrop();
      offTempo();
      window.removeEventListener("pagehide", onHide);
      ctrl?.abort();
    };
  }, [enabled]);
}
