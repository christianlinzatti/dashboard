import { createStore } from "zustand/vanilla";

/**
 * Lyrics-Versatz in drei Teilen, zusammen ergibt sich `playback.offsetMs` (+ = Lyrics später):
 * - manual: von Hand in der Steuerleiste (− / +), je Gerät gespeichert
 * - device: automatisch gelernte Lautsprecher-Verzögerung, je Gerät gespeichert
 * - song: automatisch erkannte Verschiebung nur dieses Songs (andere Version), im Song-Gedächtnis gemerkt
 */
const MANUAL_KEY = "ss_lyrics_offset";
const DEVICE_KEY = "ss_lyrics_geraet";

const read = (key: string) => {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
};
const write = (key: string, v: number) => {
  try {
    localStorage.setItem(key, String(v));
  } catch {
    /* privater Modus: gilt dann nur für diese Sitzung */
  }
};

type State = {
  manual: number;
  device: number;
  song: number;
  /** Song, für den `song` gilt */
  trackKey: string | null;
  /** in diesem Abspielen sicher geschätzt (wird dem Song-Gedächtnis gemeldet) */
  measured: { trackKey: string; song: number; n: number; spreadMs: number } | null;
  hydrate: () => void;
  changeManual: (delta: number) => void;
  setDevice: (v: number) => void;
  setSong: (trackKey: string | null, v: number) => void;
  setMeasured: (m: State["measured"]) => void;
};

export const offsetStore = createStore<State>()((set, get) => ({
  manual: 0,
  device: 0,
  song: 0,
  trackKey: null,
  measured: null,
  hydrate: () => set({ manual: read(MANUAL_KEY), device: read(DEVICE_KEY) }),
  changeManual: (delta) => {
    const manual = Math.round((get().manual + delta) / 50) * 50;
    write(MANUAL_KEY, manual);
    set({ manual });
  },
  setDevice: (device) => {
    write(DEVICE_KEY, device);
    set({ device });
  },
  setSong: (trackKey, song) => set({ trackKey, song }),
  setMeasured: (measured) => set({ measured }),
}));

export const totalOffset = (s: Pick<State, "manual" | "device" | "song">) => s.manual + s.device + s.song;
