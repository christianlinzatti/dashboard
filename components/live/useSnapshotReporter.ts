"use client";

import { useEffect } from "react";
import { runCommand } from "@/lib/live/run-command";
import { buildSnapshot, type Command } from "@/lib/song-context/snapshot";
import { stageInfo } from "@/lib/stage/stage-info";
import { recapStore, summarize } from "@/lib/show/recap";
import { songContext } from "@/lib/song-context/store";
import { lightBus } from "@/lib/stage/light-bus";
import { REPORT_INTERVAL_MS } from "@/lib/cache-policy";

/** Ist eine Fernbedienung offen, holt der Kiosk Befehle so oft ab */
const FAST_POLL_MS = 2000;

/**
 * Meldet den Song-Kontext regelmäßig (15 s beim Abspielen, sonst 60 s; bei Songwechsel,
 * Abschnittswechsel, Pause sofort) an den Server
 * und führt die Befehle aus, die dort warten (z. B. „Alexa, Lichter aus“).
 */
export function useSnapshotReporter(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    // Fernbedienung offen: Befehle alle 2 s abholen, bis der Server meldet, dass sie zu ist
    let fast: ReturnType<typeof setInterval> | undefined;
    const handle = (d: { commands?: Command[]; remote?: boolean }) => {
      for (const c of d.commands ?? []) runCommand(c);
      if (d.remote && !fast && !stopped) fast = setInterval(() => void poll(), FAST_POLL_MS);
      if (!d.remote && fast) {
        clearInterval(fast);
        fast = undefined;
      }
    };
    const poll = async () => {
      try {
        const res = await fetch("/api/commands", { cache: "no-store" });
        if (res.ok) handle(await res.json());
      } catch {
        /* nächster Versuch */
      }
    };

    const report = async () => {
      if (stopped) return;
      const snap = buildSnapshot(songContext.getState(), lightBus.latest());
      lastReport = Date.now();
      // ohne Song nichts zu melden – Befehle (z. B. „Bildschirm an“) trotzdem abholen
      if (!snap) return void poll();
      const stage = stageInfo.getState().current;
      const evening = summarize(recapStore.getState().log, Date.now());
      try {
        const res = await fetch("/api/song-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...snap,
            ...(stage ? { stage } : {}),
            ...(evening
              ? {
                  evening: {
                    songs: evening.songs,
                    minutes: evening.minutes,
                    since: evening.since,
                    highlights: evening.highlights.slice(0, 10),
                    encores: evening.encores.slice(0, 10),
                    liked: evening.liked,
                    ...(evening.topArtist ? { topArtist: evening.topArtist } : {}),
                  },
                }
              : {}),
          }),
        });
        if (res.ok) handle(await res.json());
      } catch {
        /* nächster Versuch beim nächsten Intervall */
      }
    };
    const soon = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void report(), 400);
    };

    // sparsam melden (Upstash-Kontingent): beim Abspielen alle 15 s, sonst jede Minute
    let lastReport = 0;
    const timer = setInterval(() => {
      const every = songContext.getState().playback.isPlaying ? REPORT_INTERVAL_MS.playing : REPORT_INTERVAL_MS.idle;
      if (Date.now() - lastReport >= every) void report();
    }, 5000);
    const offs = (["trackChanged", "sectionChanged", "paused", "resumed"] as const).map((e) => songContext.events.on(e, soon));
    // Likes, Konzerte und Band-Infos kommen nach dem Songwechsel – dann gleich nachmelden (für Alexa)
    offs.push(songContext.subscribe((s) => `${!!s.song?.user}${!!s.song?.concerts}${!!s.song?.info}`, soon));
    // Bühne gewechselt: der Fernbedienung zeigen, welche Effekte es jetzt gibt
    offs.push(stageInfo.subscribe(soon));
    return () => {
      stopped = true;
      clearInterval(fast);
      clearInterval(timer);
      clearTimeout(debounce);
      offs.forEach((off) => off());
    };
  }, [enabled]);
}
