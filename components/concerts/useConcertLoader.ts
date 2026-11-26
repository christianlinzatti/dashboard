"use client";

import { useEffect } from "react";
import { BRIDGE_URL, useBridgeState } from "@/components/bridge/useBridge";
import { askBridgeConcerts } from "@/lib/bridge/concerts";
import { failureMessages } from "@/lib/concerts/debug";
import { loadConcerts, type ConcertAnswer } from "@/lib/concerts/load";
import { report } from "@/lib/live/telemetry";
import { songContext } from "@/lib/song-context/store";

/** Lädt bevorstehende Konzerte und die letzte Setlist zu jedem neuen Song. */
export function useConcertLoader(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let ctrl: AbortController | undefined;
    const unsub = songContext.subscribe(
      (s) => s.song?.trackKey,
      async (key) => {
        const song = songContext.getState().song;
        if (!key || !song || song.concerts) return;
        ctrl?.abort();
        ctrl = new AbortController();
        const show = ({ concerts, setlists, area, sources = [] }: ConcertAnswer) => {
          // ausgefallene Quellen ins Kiosk-Protokoll (/debug) – nur bei frischer Abfrage, nicht bei jedem Treffer im Cache
          const failures = failureMessages(sources.filter((x) => !x.cached));
          for (const m of failures) report("warnung", "konzerte", m);
          const detail = failureMessages(sources).join(" · ");
          if (songContext.getState().song?.trackKey === key)
            songContext.getState().mergeSong({
              concerts,
              setlists,
              ...(area ? { concertArea: area } : {}),
              status: { concerts: { state: "ok", ...(detail ? { detail: `Quelle fehlt: ${detail}` } : {}) } },
            });
        };
        try {
          await loadConcerts(song, {
            // Pi-Bridge verbunden (Kiosk): oeticket/eventim.de fragt sie vom Heimanschluss aus
            viaBridge: useBridgeState.getState().state === "verbunden",
            signal: ctrl.signal,
            fetch,
            askBridge: (names, signal) => askBridgeConcerts(BRIDGE_URL, names, { signal }),
            show,
            warn: (m) => report("warnung", "konzerte", m),
          });
        } catch {
          /* Konzerte sind optional */
        }
      },
      { fireImmediately: true },
    );
    return () => {
      unsub();
      ctrl?.abort();
    };
  }, [enabled]);
}
