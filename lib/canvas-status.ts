import { createStore } from "zustand/vanilla";

/** Was mit der Spotify Canvas des laufenden Songs ist (für /debug: warum keine zu sehen ist) */
export type CanvasStatus = {
  state: "aus" | "laedt" | "keins" | "fehler" | "da";
  kind?: "video" | "image" | "gif";
  error?: string;
};

export const canvasStatus = createStore<CanvasStatus>()(() => ({ state: "aus" }));
