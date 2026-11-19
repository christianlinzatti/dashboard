import { createStore } from "zustand/vanilla";
import type { Choreography } from "@/lib/dance/plan";
import type { Cue } from "./effects";
import type { EffectKind } from "./themes";

/**
 * Effekte auf Knopfdruck (Fernbedienung, Alexa): zünden zur aktuellen Songzeit, nur für den laufenden Song.
 */
type ManualCue = { kind: EffectKind; songMs: number };

export const manualCues = createStore<{
  trackKey: string | null;
  cues: ManualCue[];
  fire: (trackKey: string, kind: EffectKind, songMs: number) => void;
}>()((set, get) => ({
  trackKey: null,
  cues: [],
  fire: (trackKey, kind, songMs) => {
    const keep = get().trackKey === trackKey ? get().cues.slice(-5) : [];
    set({ trackKey, cues: [...keep, { kind, songMs }] });
  },
}));

/** Wie lange ein Effekt auf Knopfdruck läuft (in Takten/Schlägen des Songs) */
export function manualCue(kind: EffectKind, songMs: number, c: Pick<Choreography, "barMs" | "beatMs">): Cue {
  const durationMs =
    kind === "konfetti"
      ? 1000
      : kind === "co2"
        ? 1200
        : kind === "flammen"
          ? 2 * c.beatMs
          : kind === "feuerwerk" || kind === "schaum" || kind === "glitzer" || kind === "sternschnuppen"
            ? 4 * c.barMs
            : c.barMs;
  return { kind, startMs: songMs, durationMs, intensity: 1, seed: Math.round(songMs) };
}
