import { createStore } from "zustand/vanilla";

/**
 * „Gleich kommt …“: der nächste Titel aus der Warteschlange. Kurz vor Songende wird er geholt (und vorgeladen: Lyrics,
 * Figuren, Tänze – siehe components/show/useUpNext.ts), in den letzten Sekunden zeigt die Bühne eine kleine Vorschau.
 */
export type UpNext = { trackKey: string; title: string; artists: string[]; coverUrl?: string };

/** So lange vor Songende den nächsten Titel holen und vorladen (Zeit für Lyrics-Suche und Figuren) */
export const FETCH_BEFORE_END_MS = 45_000;
/** So lange vor Songende die Vorschau zeigen */
export const SHOW_BEFORE_END_MS = 15_000;

export const shouldFetchUpNext = (durationMs: number, positionMs: number) =>
  durationMs > 0 && durationMs - positionMs <= FETCH_BEFORE_END_MS;

/** Vorschau sichtbar: letzte 15 s (nicht ganz am Ende, damit sie vor dem Umbau verschwindet), nur bei langen Songs */
export const upNextVisible = (durationMs: number, positionMs: number) => {
  const left = durationMs - positionMs;
  return durationMs > 60_000 && left <= SHOW_BEFORE_END_MS && left > 800;
};

type State = {
  /** Song, für den `next` gilt (die Vorschau gehört zum laufenden Song) */
  forTrack: string | null;
  next: UpNext | null;
  set: (forTrack: string, next: UpNext | null) => void;
};

export const upNextStore = createStore<State>()((set) => ({
  forTrack: null,
  next: null,
  set: (forTrack, next) => set({ forTrack, next }),
}));
