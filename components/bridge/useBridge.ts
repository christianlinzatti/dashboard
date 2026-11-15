"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { createBridgeClient, type BridgeState } from "@/lib/bridge/client";
import { settings } from "@/lib/settings";
import { lightBus } from "@/lib/stage/light-bus";
import { frameAgeMs } from "@/lib/live/frame-clock";

export const BRIDGE_URL = process.env.NEXT_PUBLIC_BRIDGE_URL ?? "ws://127.0.0.1:8787";

/** Verbindungsstatus der Pi-Bridge für die Oberfläche. */
export const useBridgeState = create<{ state: BridgeState }>(() => ({ state: "aus" }));

/** Überträgt die Lichtszene des LightDirectors an die Pi-Bridge (Govee-Lampen). */
export function useBridge(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const client = createBridgeClient({ url: BRIDGE_URL, onState: (state) => useBridgeState.setState({ state }) });
    client.start();
    const offLight = lightBus.subscribe((f) => client.update(f, settings.getState().lamps));
    // Lampen-Schalter sofort weitergeben, auch wenn gerade kein Frame kommt
    const offSettings = settings.subscribe((s, prev) => {
      const latest = lightBus.latest();
      if (s.lamps !== prev.lamps && latest) client.update(latest, s.lamps);
    });
    // Lebenszeichen alle 10 s: hängt die Seite oder die Grafik, startet die Bridge den Kiosk neu
    const beat = setInterval(() => {
      const visible = document.visibilityState === "visible";
      client.heartbeat(visible ? frameAgeMs() : 0, visible);
    }, 10_000);
    return () => {
      offLight();
      offSettings();
      clearInterval(beat);
      client.stop();
    };
  }, [enabled]);
}
