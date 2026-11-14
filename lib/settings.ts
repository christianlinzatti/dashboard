import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { qualities, type Quality } from "@/lib/stage/quality";

/** Geräte-Einstellungen (pro Dashboard im Browser gespeichert). */
export type Settings = {
  /** "auto" passt sich der gemessenen Bildrate an */
  quality: Quality | "auto";
  /** Stroboskop-Blitze bei Drops (Fotosensitivität) */
  strobe: boolean;
};

const KEY = "ss_settings";
const defaults: Settings = { quality: "auto", strobe: true };

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    return {
      quality:
        raw.quality === "auto" || qualities.includes(raw.quality as Quality)
          ? (raw.quality as Settings["quality"])
          : defaults.quality,
      strobe: typeof raw.strobe === "boolean" ? raw.strobe : defaults.strobe,
    };
  } catch {
    return defaults;
  }
}

export const settings = createStore<Settings & { set(p: Partial<Settings>): void; hydrate(): void }>()((set, get) => ({
  ...defaults,
  set(p) {
    set(p);
    try {
      const { quality, strobe } = get();
      localStorage.setItem(KEY, JSON.stringify({ quality, strobe }));
    } catch {
      /* privater Modus */
    }
  },
  hydrate() {
    set(load());
  },
}));

export function useSettings<T>(sel: (s: Settings & { set(p: Partial<Settings>): void }) => T): T {
  return useStore(settings, sel);
}
