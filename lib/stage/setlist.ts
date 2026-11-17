import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { ThemeId } from "./themes";

/**
 * Gedächtnis des Abends: welche Songs schon liefen, auf welcher Bühne und mit welchen Tänzen.
 * Daraus entsteht Abwechslung über die Setlist – der nächste Song meidet die Bühne des vorigen und
 * (weich) die Tänze der letzten beiden. Nur im Speicher: ein Neuladen beginnt einen neuen Abend
 * (und Demos/Tests bleiben reproduzierbar).
 */
export type PlayedSong = { trackKey: string; theme: ThemeId; clips: string[] };

const KEEP = 6;
/** Tänze der letzten so vielen Songs werden seltener gewählt */
export const AVOID_SONGS = 2;

type State = { played: PlayedSong[]; record: (song: PlayedSong) => void; reset: () => void };

export const setlistStore = createStore<State>()((set) => ({
  played: [],
  // derselbe Song (z. B. neu geplant nach Tempo-Änderung) ersetzt seinen Eintrag statt einen neuen anzuhängen
  record: (song) =>
    set((s) => {
      const rest = s.played.at(-1)?.trackKey === song.trackKey ? s.played.slice(0, -1) : s.played;
      return { played: [...rest, song].slice(-KEEP) };
    }),
  reset: () => set({ played: [] }),
}));

/** Die Songs vor dem aktuellen (ohne ihn selbst – auch wenn er gerade aufgezeichnet wurde) */
export function before(played: readonly PlayedSong[], trackKey: string | undefined): PlayedSong[] {
  return played.filter((p) => p.trackKey !== trackKey);
}

/** Bühne des vorigen Songs */
export function previousTheme(played: readonly PlayedSong[], trackKey: string | undefined): ThemeId | undefined {
  return before(played, trackKey).at(-1)?.theme;
}

/** Tänze der letzten Songs als stabiler Schlüssel (für useMemo) */
export function recentClipsKey(played: readonly PlayedSong[], trackKey: string | undefined): string {
  return [
    ...new Set(
      before(played, trackKey)
        .slice(-AVOID_SONGS)
        .flatMap((p) => p.clips),
    ),
  ]
    .sort()
    .join(",");
}

export function usePreviousTheme(trackKey: string | undefined) {
  return useStore(setlistStore, (s) => previousTheme(s.played, trackKey));
}

export function useRecentClipsKey(trackKey: string | undefined) {
  return useStore(setlistStore, (s) => recentClipsKey(s.played, trackKey));
}
