import { createStore } from "zustand/vanilla";

/**
 * Erinnerungsfoto: Auslöser (Knopf, Fernbedienung, Alexa) → Aufnahme im nächsten Bild der Bühne → Bild mit Songzeile
 * zusammensetzen und hochladen → QR-Code zum Handy. Ohne 3D-Bühne (Canvas-Video, kein WebGL) gibt es kein Foto.
 */
export type PhotoPhase = "aus" | "aufnahme" | "hochladen" | "fertig" | "fehler";

type State = {
  phase: PhotoPhase;
  /** Rohbild der Bühne (Daten-URL), bis es zusammengesetzt ist */
  raw: string | null;
  /** fertiges Bild (Daten-URL, für die Vorschau) */
  image: string | null;
  /** Adresse auf dem Server (null in Demos: nichts hochgeladen) */
  id: string | null;
  error: string | null;
  request: () => void;
  captured: (raw: string) => void;
  done: (image: string, id: string | null) => void;
  failed: (error: string) => void;
  clear: () => void;
};

export const photoStore = createStore<State>()((set, get) => ({
  phase: "aus",
  raw: null,
  image: null,
  id: null,
  error: null,
  // läuft schon eine Aufnahme, zählt der zweite Auslöser nicht
  request: () => {
    if (get().phase === "aufnahme" || get().phase === "hochladen") return;
    set({ phase: "aufnahme", raw: null, image: null, id: null, error: null });
  },
  captured: (raw) => set({ phase: "hochladen", raw }),
  done: (image, id) => set({ phase: "fertig", raw: null, image, id }),
  failed: (error) => set({ phase: "fehler", raw: null, error }),
  clear: () => set({ phase: "aus", raw: null, image: null, id: null, error: null }),
}));
