import { createStore } from "zustand/vanilla";
import { subscribeWithSelector } from "zustand/middleware";
import { useStore } from "zustand";
import { derive, emptyDerived, positionAt } from "./derive";
import { createEmitter, type SongEvents } from "./events";
import type { Derived, Live, Playback, SongStatic } from "./schema";

export type SongContextState = {
  song: SongStatic | null;
  playback: Playback;
  live: Live;
  derived: Derived;
  /** Aktuelle, um den Offset korrigierte Songzeit in ms (wird pro Frame aktualisiert) */
  positionMs: number;
  /** Eingefrorene Zeit (Demo/Screenshots): keine Interpolation */
  frozen: boolean;
};

export type SongContextActions = {
  /** Neuer Song (oder null) – setzt alles zurück, was songabhängig ist. */
  setSong(song: SongStatic | null): void;
  /** Schrittweise Anreicherung (z. B. Lyrics oder Infos kommen später). */
  mergeSong(patch: Partial<SongStatic>): void;
  setPlayback(patch: Partial<Playback>): void;
  setLive(patch: Partial<Live>): void;
  setFrozen(frozen: boolean): void;
  /** Pro Frame aufrufen: berechnet Songzeit und abgeleitete Werte. */
  tick(now: number): void;
};

export type SongContextStore = ReturnType<typeof createSongContextStore>;

const initialPlayback: Playback = { isPlaying: false, positionMs: 0, updatedAt: 0, offsetMs: 0 };
const initialLive: Live = { bpm: 120, beatPhase: 0, bar: 0, energy: 0, bands: [], vocal: 0, micActive: false };

export function createSongContextStore() {
  const events = createEmitter<SongEvents>();

  const store = createStore<SongContextState & SongContextActions>()(
    subscribeWithSelector((set, get) => ({
      song: null,
      playback: initialPlayback,
      live: initialLive,
      derived: emptyDerived,
      positionMs: 0,
      frozen: false,

      setSong(song) {
        const prev = get().song;
        set({ song, derived: emptyDerived });
        if (prev?.trackKey !== song?.trackKey) events.emit("trackChanged", { trackKey: song?.trackKey ?? null });
        if (song?.lyrics && !prev?.lyrics) events.emit("lyricsReady", { quality: song.lyrics.quality });
      },

      mergeSong(patch) {
        const prev = get().song;
        if (!prev) return;
        const next = { ...prev, ...patch, status: { ...prev.status, ...patch.status } };
        set({ song: next });
        if (patch.lyrics && !prev.lyrics) events.emit("lyricsReady", { quality: patch.lyrics.quality });
      },

      setPlayback(patch) {
        const prev = get().playback;
        const next = { ...prev, ...patch };
        set({ playback: next });
        if (prev.isPlaying && !next.isPlaying) events.emit("paused", {});
        if (!prev.isPlaying && next.isPlaying) events.emit("resumed", {});
      },

      setLive(patch) {
        set({ live: { ...get().live, ...patch } });
      },

      setFrozen(frozen) {
        set({ frozen });
      },

      tick(now) {
        const { song, playback, derived: prev, frozen } = get();
        const raw = frozen ? playback.positionMs : positionAt(playback, now, song?.track.durationMs);
        const t = raw - playback.offsetMs;
        const d = derive(song, t);
        set({ positionMs: raw, derived: sameDerived(prev, d) ? prev : d });

        if (d.lineIdx !== prev.lineIdx) events.emit("lineChanged", { lineIdx: d.lineIdx });
        if (d.section !== prev.section) {
          events.emit("sectionChanged", { section: d.section });
          if (d.isChorus) events.emit("chorusStart", {});
        }
        if (d.activeSingerId !== prev.activeSingerId) events.emit("singerChanged", { artistId: d.activeSingerId });
      },
    })),
  );

  return Object.assign(store, { events });
}

function sameDerived(a: Derived, b: Derived) {
  return (
    a.lineIdx === b.lineIdx &&
    a.lineActive === b.lineActive &&
    a.wordIdx === b.wordIdx &&
    a.wordProgress === b.wordProgress &&
    a.section === b.section &&
    a.activeSingerId === b.activeSingerId &&
    a.secondsToNextLyric === b.secondsToNextLyric
  );
}

/** App-weiter Song-Kontext (ein Dashboard = ein Song). */
export const songContext = createSongContextStore();

/** React-Hook mit Selektor: Komponenten abonnieren nur die Felder, die sie brauchen. */
export function useSongContext<T>(selector: (s: SongContextState & SongContextActions) => T): T {
  return useStore(songContext, selector);
}
