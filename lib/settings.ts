import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { secondLineModes, type SecondLineMode } from "@/lib/lyrics/second-line";
import { qualities, type Quality } from "@/lib/stage/quality";
import { isThemeChoice, type ThemeChoice } from "@/lib/stage/themes";

/** Geräte-Einstellungen (pro Dashboard im Browser gespeichert). */
export type Settings = {
  /** "auto" passt sich der gemessenen Bildrate an */
  quality: Quality | "auto";
  /** Stroboskop-Blitze bei Drops (Fotosensitivität) */
  strobe: boolean;
  /** Externe Lampen (Govee über die Pi-Bridge) ansteuern */
  lamps: boolean;
  /** Zweite Lyrics-Zeile: Umschrift/Übersetzung */
  secondLine: SecondLineMode;
  /** Bühne: "auto" wählt nach Genre (sonst wechselnd pro Song) */
  stage: ThemeChoice;
  /** Spotify Canvas (Loop-Video des Künstlers) statt der 3D-Bühne zeigen, wenn vorhanden */
  canvas: boolean;
  /** Publikumsgeräusche (Applaus am Songende, Zugabe-Klatschen) aus dem Browser – leise, Standard aus */
  crowdSound: boolean;
};

const KEY = "ss_settings";
const defaults: Settings = {
  quality: "auto",
  strobe: true,
  lamps: true,
  secondLine: "auto",
  stage: "auto",
  canvas: false,
  crowdSound: false,
};

function load(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Settings>;
    return {
      quality:
        raw.quality === "auto" || qualities.includes(raw.quality as Quality)
          ? (raw.quality as Settings["quality"])
          : defaults.quality,
      strobe: typeof raw.strobe === "boolean" ? raw.strobe : defaults.strobe,
      lamps: typeof raw.lamps === "boolean" ? raw.lamps : defaults.lamps,
      secondLine: secondLineModes.includes(raw.secondLine as SecondLineMode)
        ? (raw.secondLine as SecondLineMode)
        : defaults.secondLine,
      stage: isThemeChoice(raw.stage) ? raw.stage : defaults.stage,
      canvas: typeof raw.canvas === "boolean" ? raw.canvas : defaults.canvas,
      crowdSound: typeof raw.crowdSound === "boolean" ? raw.crowdSound : defaults.crowdSound,
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
      const { quality, strobe, lamps, secondLine, stage, canvas, crowdSound } = get();
      localStorage.setItem(KEY, JSON.stringify({ quality, strobe, lamps, secondLine, stage, canvas, crowdSound }));
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
