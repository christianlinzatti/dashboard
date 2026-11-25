"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { timeScaleFor } from "@/lib/avatars/catalog";
import { beatStride, resolveOctave, TempoLock, updateAnchor } from "@/lib/audio/lock";
import { startMic, type MicHandle } from "@/lib/audio/mic";
import { positionAt } from "@/lib/song-context/derive";
import type { Live, MicState } from "@/lib/song-context/schema";
import { songContext } from "@/lib/song-context/store";

const PREF_KEY = "ss_mic";
/** Verzögerung Lautsprecher → Mikro → Analyse (ms), wird von der Beat-Zeit abgezogen */
const LATENCY_MS = 40;
/** so lange auf den Start der Tonverarbeitung warten, bevor das Mikro trotzdem als an gilt */
const RESUME_WAIT_MS = 1500;

/** Angehaltene Tonverarbeitung bei der nächsten Berührung oder Taste starten (Autoplay-Regeln des Browsers) */
function resumeOnGesture(h: MicHandle) {
  const go = () => {
    void h.resume().catch(() => undefined);
    window.removeEventListener("pointerdown", go);
    window.removeEventListener("keydown", go);
  };
  window.addEventListener("pointerdown", go);
  window.addEventListener("keydown", go);
}

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "an";
  } catch {
    return false;
  }
}
function writePref(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "an" : "aus");
  } catch {
    /* privater Modus */
  }
}

/**
 * Mikrofon-Analyse → Song-Kontext (live): Tempo (eingerastet), Beat-Raster in Songzeit,
 * Energie, Bänder, Stimme, Drops. Startet automatisch, wenn es zuletzt an war
 * oder die Berechtigung schon erteilt ist.
 */
export function useMicAnalysis(enabled: boolean) {
  const [state, setState] = useState<MicState>("aus");
  const handle = useRef<MicHandle | null>(null);

  const setMic = (micState: MicState) => {
    setState(micState);
    songContext.getState().setLive({ micState, micActive: micState === "aktiv" });
  };

  const stop = useCallback(() => {
    handle.current?.stop();
    handle.current = null;
    setMic("aus");
  }, []);

  const starting = useRef(false);
  const start = useCallback(async () => {
    if (handle.current || starting.current) return;
    starting.current = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      starting.current = false;
      return setMic("nicht-verfuegbar");
    }
    setMic("startet");
    const lock = new TempoLock();
    let anchor: number | null = null;
    let frame = 0;

    // Bei Songwechsel: Tempo und Raster neu bestimmen
    const unsub = songContext.events.on("trackChanged", () => {
      lock.reset();
      anchor = null;
      const hint = songContext.getState().song?.music.bpmHint;
      songContext.getState().setLive({
        bpm: hint ?? 120,
        tempoLocked: false,
        gridAnchorMs: null,
        lastDropMs: null,
        drums: { kick: null, snare: null, hat: null },
      });
    });

    try {
      const h = await startMic((f) => {
        const s = songContext.getState();
        const playing = !!s.song && (s.frozen || s.playback.isPlaying);
        const songMs = s.frozen ? s.positionMs : positionAt(s.playback, performance.now(), s.song?.track.durationMs);
        const bs = f.beatState;
        const patch: Partial<Live> = {
          bpmMeasured: bs.bpm,
          bpmConfidence: bs.confidence,
          beatPhase: bs.phase,
          beatCount: bs.beatCount,
          energy: f.energy,
          bands: f.bands,
          vocal: f.vocal,
        };

        // Startwert (Deezer) löst Oktavfehler auf: 85 statt 170 BPM gemessen → 170
        const locked = lock.push(resolveOctave(bs.bpm, s.song?.music.bpmHint), bs.confidence, f.dt);
        if (locked !== null) {
          patch.bpm = locked;
          patch.tempoLocked = true;
          songContext.events.emit("tempoLocked", { bpm: locked });
        }

        if (f.beat && playing) {
          const danceBeatMs = 500 / timeScaleFor(patch.bpm ?? s.live.bpm);
          if (bs.beatCount % beatStride(danceBeatMs, 60_000 / bs.bpm) === 0) {
            anchor = updateAnchor(anchor, songMs - LATENCY_MS, danceBeatMs);
            patch.gridAnchorMs = anchor;
          }
          songContext.events.emit("beat", { count: bs.beatCount });
        }
        if (playing && (f.drums.kick || f.drums.snare || f.drums.hat)) {
          const at = songMs - LATENCY_MS;
          patch.drums = {
            kick: f.drums.kick ? at : s.live.drums.kick,
            snare: f.drums.snare ? at : s.live.drums.snare,
            hat: f.drums.hat ? at : s.live.drums.hat,
          };
        }
        if (f.drop && playing) {
          patch.lastDropMs = songMs;
          songContext.events.emit("drop", { songMs });
        }

        // Store mit ~50 Hz aktualisieren (Ereignisse sofort)
        if (++frame % 2 === 0 || f.beat || f.drop || patch.drums || locked !== null) s.setLive(patch);
      });
      handle.current = h;
      const origStop = h.stop;
      h.stop = () => {
        unsub();
        origStop();
      };
      // Der Browser kann den Ton bis zur ersten Berührung anhalten (Autoplay-Regeln): nicht ewig warten – das Mikro gilt
      // als an, und die nächste Berührung bzw. Taste startet die Auswertung
      if (h.context.state !== "running") {
        await Promise.race([h.resume().catch(() => undefined), new Promise((r) => setTimeout(r, RESUME_WAIT_MS))]);
        // (state ändert sich durch das await – TypeScript verengt den Typ trotzdem)
        if ((h.context.state as AudioContextState) !== "running") resumeOnGesture(h);
      }
      setMic("aktiv");
      writePref(true);
    } catch (e) {
      unsub();
      const name = (e as Error).name;
      setMic(
        name === "NotAllowedError" || name === "SecurityError"
          ? "verweigert"
          : name === "NotFoundError"
            ? "nicht-verfuegbar"
            : "fehler",
      );
    } finally {
      starting.current = false;
    }
  }, []);

  const toggle = useCallback(() => {
    if (starting.current) return;
    if (handle.current) {
      stop();
      writePref(false);
    } else void start();
  }, [start, stop]);

  // Autostart: wenn zuletzt an oder Berechtigung bereits erteilt
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      let granted = false;
      try {
        granted = (await navigator.permissions?.query({ name: "microphone" as PermissionName }))?.state === "granted";
      } catch {
        /* Permissions-API nicht verfügbar */
      }
      if (!cancelled && (readPref() || granted)) void start();
    })();
    // AudioContext braucht ggf. eine Nutzer-Geste (ohne Kiosk-Flag)
    const resume = () => void handle.current?.resume();
    window.addEventListener("pointerdown", resume);
    return () => {
      cancelled = true;
      window.removeEventListener("pointerdown", resume);
      handle.current?.stop();
      handle.current = null;
    };
  }, [enabled, start]);

  return { state, toggle };
}
