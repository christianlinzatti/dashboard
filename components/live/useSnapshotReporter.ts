"use client";

import { useEffect } from "react";
import { settingsPatchFor } from "@/lib/live/commands";
import { settings } from "@/lib/settings";
import { buildSnapshot, type Command } from "@/lib/song-context/snapshot";
import { songContext } from "@/lib/song-context/store";
import { lightBus } from "@/lib/stage/light-bus";

const INTERVAL_MS = 5000;

/**
 * Meldet den Song-Kontext regelmäßig (und bei Songwechsel, Abschnittswechsel, Pause) an den Server
 * und führt die Befehle aus, die dort warten (z. B. „Alexa, Lichter aus“).
 */
export function useSnapshotReporter(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let debounce: ReturnType<typeof setTimeout> | undefined;

    const report = async () => {
      const snap = buildSnapshot(songContext.getState(), lightBus.latest());
      if (!snap || stopped) return;
      try {
        const res = await fetch("/api/song-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snap),
        });
        if (!res.ok) return;
        const { commands } = (await res.json()) as { commands: Command[] };
        for (const c of commands) {
          const patch = settingsPatchFor(c);
          if (patch) settings.getState().set(patch);
        }
      } catch {
        /* nächster Versuch beim nächsten Intervall */
      }
    };
    const soon = () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void report(), 400);
    };

    const timer = setInterval(() => void report(), INTERVAL_MS);
    const offs = (["trackChanged", "sectionChanged", "paused", "resumed"] as const).map((e) => songContext.events.on(e, soon));
    return () => {
      stopped = true;
      clearInterval(timer);
      clearTimeout(debounce);
      offs.forEach((off) => off());
    };
  }, [enabled]);
}
