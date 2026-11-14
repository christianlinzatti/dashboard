import type { LightFrame } from "./lights";

/**
 * Aktuelle Lichtszene außerhalb von React/Three.js verfügbar machen
 * (für die Pi-Bridge/Govee und den Server-Schnappschuss). Wird pro Frame vom Director gesetzt.
 */
type Listener = (f: LightFrame) => void;
let latest: LightFrame | null = null;
const listeners = new Set<Listener>();

export const lightBus = {
  publish(f: LightFrame) {
    latest = f;
    listeners.forEach((l) => l(f));
  },
  latest: () => latest,
  subscribe(l: Listener) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};
