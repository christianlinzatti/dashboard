import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { secondLineModes, type SecondLineMode } from "@/lib/lyrics/second-line";
import { qualities, type Quality } from "@/lib/stage/quality";
import { isThemeChoice, type ThemeChoice } from "@/lib/stage/themes";
import { sharedDiffers, sharedOf, type SharedSettings } from "./settings-sync";

export const canvasModes = ["aus", "buehne", "vollbild"] as const;
export type CanvasMode = (typeof canvasModes)[number];

/** frühere Einstellung (an/aus) übernehmen: „an“ hieß Vollbild */
export function canvasModeFrom(raw: unknown): CanvasMode {
  if (raw === true) return "vollbild";
  return canvasModes.includes(raw as CanvasMode) ? (raw as CanvasMode) : "aus";
}

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
  /**
   * Spotify Canvas (Loop-Video des Künstlers), wenn vorhanden: "vollbild" statt der 3D-Bühne,
   * "buehne" auf der LED-Wand der Bühne (Club, Festival, Stadion), "aus" gar nicht
   */
  canvas: CanvasMode;
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
  canvas: "aus",
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
      canvas: canvasModeFrom(raw.canvas),
      crowdSound: typeof raw.crowdSound === "boolean" ? raw.crowdSound : defaults.crowdSound,
    };
  } catch {
    return defaults;
  }
}

type Store = Settings & {
  /** wann eine geteilte Einstellung (alles außer Qualität) zuletzt auf diesem Gerät geändert wurde (0 = nie) */
  changedAt: number;
  set(p: Partial<Settings>): void;
  /** Stand aus dem Konto übernehmen, wenn er jünger ist als der eigene (zählt nicht als eigene Änderung) */
  applyRemote(shared: SharedSettings, at: number): void;
  hydrate(): void;
};

function loadChangedAt(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as { changedAt?: unknown };
    return typeof raw.changedAt === "number" ? raw.changedAt : 0;
  } catch {
    return 0;
  }
}

export const settings = createStore<Store>()((set, get) => {
  const persist = () => {
    try {
      const { quality, strobe, lamps, secondLine, stage, canvas, crowdSound, changedAt } = get();
      localStorage.setItem(KEY, JSON.stringify({ quality, strobe, lamps, secondLine, stage, canvas, crowdSound, changedAt }));
    } catch {
      /* privater Modus */
    }
  };
  return {
    ...defaults,
    changedAt: 0,
    set(p) {
      const before = sharedOf(get());
      set(p);
      if (sharedDiffers(before, sharedOf(get()))) set({ changedAt: Date.now() });
      persist();
    },
    applyRemote(shared, at) {
      if (at <= get().changedAt) return;
      set({ ...shared, changedAt: at });
      persist();
    },
    hydrate() {
      set({ ...load(), changedAt: loadChangedAt() });
    },
  };
});

export function useSettings<T>(sel: (s: Store) => T): T {
  return useStore(settings, sel);
}
