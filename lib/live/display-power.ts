import { createStore } from "zustand/vanilla";

/**
 * Soll der Bildschirm an sein? Die Ruhezeit setzt „aus“; die Pi-Bridge schaltet dann (falls eingerichtet) per
 * HDMI ab – ohne Bridge bleibt es beim schwarzen Bild.
 */
export const displayPower = createStore<{ on: boolean; set: (on: boolean) => void }>()((set) => ({
  on: true,
  set: (on) => set({ on }),
}));
