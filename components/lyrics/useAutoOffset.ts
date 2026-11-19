"use client";

import { useEffect } from "react";
import { cueStarts, estimate, matchOnset, splitOffset, VOCAL_ONSET_BIAS_MS, VocalOnsets } from "@/lib/lyrics/auto-offset";
import { offsetStore, totalOffset } from "@/lib/lyrics/offset-store";
import { songContext } from "@/lib/song-context/store";

/** Verzögerung Lautsprecher → Mikrofon → Analyse (wie beim Beat-Raster) */
const MIC_LATENCY_MS = 40;
/** So viele neue Einsätze, bevor neu geschätzt wird */
const REESTIMATE_EVERY = 3;
const KEEP = 40;

/**
 * Lyrics-Versatz automatisch einstellen: hört mit dem Mikrofon, wann gesungen wird, und vergleicht mit den
 * Zeilenanfängen. Kleine Abweichungen lernt das Gerät als Lautsprecher-Verzögerung, große gelten nur für den Song.
 * Der eingestellte Versatz (von Hand + automatisch) geht in `playback.offsetMs`.
 */
export function useAutoOffset(enabled: boolean) {
  useEffect(() => {
    const store = offsetStore;
    store.getState().hydrate();
    const apply = () => songContext.getState().setPlayback({ offsetMs: totalOffset(store.getState()) });
    apply();
    const offStore = store.subscribe(apply);
    if (!enabled) return offStore;

    let onsets = new VocalOnsets();
    let diffs: number[] = [];
    let sinceEstimate = 0;
    let starts: number[] = [];

    // Songwechsel: neu sammeln; songeigene Verschiebung aus dem Song-Gedächtnis übernehmen
    const offTrack = songContext.subscribe(
      (s) => `${s.song?.trackKey ?? ""}|${s.song?.memory?.lyricsShiftMs ?? 0}|${s.song?.lyrics?.lines.length ?? 0}`,
      () => {
        const song = songContext.getState().song;
        const key = song?.trackKey ?? null;
        if (store.getState().trackKey !== key) {
          // (die Messung des vorigen Songs bleibt stehen: das Song-Gedächtnis meldet sie beim Wechsel)
          onsets = new VocalOnsets();
          diffs = [];
          sinceEstimate = 0;
        }
        const lyrics = song?.lyrics;
        starts = lyrics && lyrics.quality !== "plain" ? cueStarts(lyrics.lines) : [];
        // eine in diesem Abspielen schon gemessene Verschiebung hat Vorrang vor dem Gedächtnis
        const measured = store.getState().measured;
        const shift = measured && measured.trackKey === key ? measured.song : (song?.memory?.lyricsShiftMs ?? 0);
        store.getState().setSong(key, shift);
      },
      { fireImmediately: true },
    );

    const offVocal = songContext.subscribe(
      (s) => s.live.vocal,
      (vocal) => {
        const s = songContext.getState();
        if (!s.live.micActive || !s.playback.isPlaying || s.frozen || !s.song || !starts.length) return;
        if (!onsets.push(vocal, s.positionMs)) return;
        const heard = s.positionMs - MIC_LATENCY_MS - VOCAL_ONSET_BIAS_MS;
        const d = matchOnset(heard, starts, totalOffset(store.getState()));
        if (d === null) return;
        diffs = [...diffs, d].slice(-KEEP);
        if (++sinceEstimate < REESTIMATE_EVERY) return;
        const e = estimate(diffs);
        if (!e) return;
        sinceEstimate = 0;
        const st = store.getState();
        const next = splitOffset(e.offsetMs, st);
        if (next.device !== st.device) st.setDevice(next.device);
        st.setSong(s.song.trackKey, next.song);
        st.setMeasured({ trackKey: s.song.trackKey, song: next.song, n: e.n, spreadMs: e.spreadMs });
      },
    );

    return () => {
      offStore();
      offTrack();
      offVocal();
    };
  }, [enabled]);
}
