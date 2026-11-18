import { createStore } from "zustand/vanilla";

/**
 * Übergang zwischen zwei Songs: welcher Song gerade „angesagt“ wird (Umbau oder Zugabe) und ob das Licht schon
 * wieder an ist. Gesetzt vom Abend-Tracker beim Songwechsel (unabhängig davon, ob Komponenten neu aufgebaut werden).
 */
export type TransitionKind = "umbau" | "zugabe";

type State = {
  key: string | null;
  kind: TransitionKind | null;
  /** Song, dessen Übergang schon ausgeblendet ist */
  hidden: string | null;
  start: (key: string, kind: TransitionKind) => void;
  hide: (key: string) => void;
  reset: () => void;
};

export const transitionStore = createStore<State>()((set) => ({
  key: null,
  kind: null,
  hidden: null,
  start: (key, kind) => set({ key, kind, hidden: null }),
  hide: (key) => set((s) => (s.key === key ? { hidden: key } : s)),
  reset: () => set({ key: null, kind: null, hidden: null }),
}));
