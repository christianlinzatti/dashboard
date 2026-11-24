import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import type { ThemeId } from "./themes";
import { eveningPhase, type EveningEntry, type EveningPhase } from "@/lib/show/evening";
import type { Mood } from "@/lib/show/brief";

/**
 * Gedächtnis des Abends: welche Songs schon liefen, auf welcher Bühne und mit welchen Tänzen.
 * Daraus entsteht Abwechslung über die Setlist – der nächste Song meidet die Bühne des vorigen und
 * (weich) die Tänze der letzten beiden. Nur im Speicher: ein Neuladen beginnt einen neuen Abend
 * (und Demos/Tests bleiben reproduzierbar).
 */
export type PlayedSong = {
  trackKey: string;
  theme?: ThemeId;
  clips?: string[];
  /** Lead-Künstler (Spotify-ID) – für den Tour-Look */
  artistId?: string;
} & EveningEntry;

const KEEP = 6;
/** Tänze der letzten so vielen Songs werden seltener gewählt */
export const AVOID_SONGS = 2;

type State = {
  played: PlayedSong[];
  /** Song festhalten bzw. ergänzen: der Abend (Stimmung, Like, Phase) und die Bühne (Thema, Tänze) melden getrennt */
  record: (song: PlayedSong) => void;
  /** Song wurde (fast) bis zum Ende gespielt – Voraussetzung für eine Zugabe */
  finish: (trackKey: string) => void;
  reset: () => void;
};

export const setlistStore = createStore<State>()((set) => ({
  played: [],
  // derselbe Song (neu geplant, Daten nachgeladen, zweite Meldung) ergänzt seinen Eintrag statt einen neuen anzuhängen
  record: (song) =>
    set((s) => {
      const same = s.played.at(-1)?.trackKey === song.trackKey ? s.played.at(-1) : undefined;
      const rest = same ? s.played.slice(0, -1) : s.played;
      const defined = Object.fromEntries(Object.entries(song).filter(([, v]) => v !== undefined)) as PlayedSong;
      return { played: [...rest, { ...same, ...defined }].slice(-KEEP) };
    }),
  finish: (trackKey) =>
    set((s) => {
      const last = s.played.at(-1);
      if (!last || last.trackKey !== trackKey || last.finished) return s;
      return { played: [...s.played.slice(0, -1), { ...last, finished: true }] };
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
        .flatMap((p) => p.clips ?? []),
    ),
  ]
    .sort()
    .join(",");
}

/**
 * Tour-Look: Bühne, auf der derselbe Lead-Künstler an diesem Abend zuletzt stand. Kommt er wieder, steht er auf
 * derselben Bühne – wie eine Tour mit festem Bühnenbild.
 */
export function tourTheme(
  played: readonly PlayedSong[],
  artistId: string | undefined,
  trackKey: string | undefined,
): ThemeId | undefined {
  if (!artistId) return undefined;
  return before(played, trackKey).findLast((p) => p.artistId === artistId && p.theme)?.theme;
}

export function useTourTheme(artistId: string | undefined, trackKey: string | undefined) {
  return useStore(setlistStore, (s) => tourTheme(s.played, artistId, trackKey));
}

export function usePreviousTheme(trackKey: string | undefined) {
  return useStore(setlistStore, (s) => previousTheme(s.played, trackKey));
}

/** Phase des Abends für diesen Song (aus den Songs davor) */
export function eveningPhaseFor(
  played: readonly PlayedSong[],
  trackKey: string | undefined,
  mood: Mood | undefined,
): EveningPhase {
  return eveningPhase(before(played, trackKey), mood);
}

export function useEveningPhase(trackKey: string | undefined, mood: Mood | undefined) {
  return useStore(setlistStore, (s) => eveningPhaseFor(s.played, trackKey, mood));
}

export function useRecentClipsKey(trackKey: string | undefined) {
  return useStore(setlistStore, (s) => recentClipsKey(s.played, trackKey));
}
