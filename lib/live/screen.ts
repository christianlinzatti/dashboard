import { createStore } from "zustand/vanilla";

/**
 * Bildschirm von Hand (Fernbedienung, Alexa): „aus“ macht ihn schwarz (mit Pi-Bridge per HDMI), bis jemand
 * antippt oder „an“ sagt. `wokeAt`: zuletzt geweckt – hält auch die Ruhezeit kurz auf.
 */
export const screenStore = createStore<{ manualOff: boolean; wokeAt: number | null; set: (on: boolean) => void }>()((set) => ({
  manualOff: false,
  wokeAt: null,
  set: (on) => set(on ? { manualOff: false, wokeAt: Date.now() } : { manualOff: true }),
}));
