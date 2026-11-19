import { createStore } from "zustand/vanilla";
import type { EffectKind, ThemeId } from "./themes";

/** Welche Bühne gerade steht (für die Fernbedienung: nur Effekte anbieten, die es dort gibt) */
export const stageInfo = createStore<{
  current: { id: ThemeId; effects: EffectKind[] } | null;
  set: (c: { id: ThemeId; effects: EffectKind[] } | null) => void;
}>()((set) => ({ current: null, set: (current) => set({ current }) }));
