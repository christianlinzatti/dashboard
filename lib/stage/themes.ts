import { hash } from "@/lib/avatars/casting";
import type { Palette, SongStatic } from "@/lib/song-context/schema";

/**
 * Bühnen-Themen: Kulisse, Farbstimmung und erlaubte Spezialeffekte.
 * Auswahl nach Genre (oder fest in den Einstellungen); ohne passendes Genre wechselt die Bühne
 * von Song zu Song (deterministisch nach Track) – so bleibt es abwechslungsreich.
 */
export const themeIds = ["club", "festival", "synthwave", "jazz", "weltraum"] as const;
export type ThemeId = (typeof themeIds)[number];
export type ThemeChoice = ThemeId | "auto";

export const effectKinds = [
  "pyro",
  "funken",
  "flammen",
  "co2",
  "konfetti",
  "feuerwerk",
  "ringe",
  "sternschnuppen",
  "glitzer",
] as const;
export type EffectKind = (typeof effectKinds)[number];

export type Theme = {
  id: ThemeId;
  label: string;
  /** Hintergrund: einfarbig (Club), Abendhimmel, Synthwave-Sonne, Vorhang, Sternenhimmel */
  sky: "dunkel" | "abend" | "retro" | "vorhang" | "sterne";
  floor: "spiegel" | "buehne" | "raster" | "holz" | "mond";
  /** Rückwand: LED-Wand, Retro-Sonne, Vorhang (ohne Wand), Planet */
  wall: "led" | "sonne" | "vorhang" | "planet";
  truss: "club" | "dach" | "keine" | "bogen";
  /** Anteil, zu dem die Themenfarben die Cover-Palette überlagern (0 = nur Cover) */
  tint: number;
  colors: { accent: string; dominant: string; dark: string };
  lasers: boolean;
  /** Helligkeit der Moving Heads (Jazz: gedämpft) */
  headLevel: number;
  effects: EffectKind[];
  /** Farben der Partikeleffekte (Pyro, Funken …); leer = Palette */
  fire: [string, string];
  /** Nebelabstand (Szene-Fog) – weiter draußen bei Open Air */
  fogFar: number;
  /** Publikum vor der Bühne: Dichte 0..1 (0 = keines) */
  crowd: number;
};

export const THEMES: Record<ThemeId, Theme> = {
  club: {
    id: "club",
    label: "Club",
    sky: "dunkel",
    floor: "spiegel",
    wall: "led",
    truss: "club",
    tint: 0,
    colors: { accent: "#ff4fd8", dominant: "#7b2cff", dark: "#0b0712" },
    lasers: true,
    headLevel: 1,
    effects: ["co2", "funken", "flammen", "ringe", "konfetti"],
    fire: ["#ffffff", "#9fd8ff"],
    fogFar: 20,
    crowd: 0.75,
  },
  festival: {
    id: "festival",
    label: "Festival",
    sky: "abend",
    floor: "buehne",
    wall: "led",
    truss: "dach",
    tint: 0.25,
    colors: { accent: "#ffb347", dominant: "#ff5e3a", dark: "#140a1e" },
    lasers: true,
    headLevel: 1,
    effects: ["pyro", "funken", "flammen", "co2", "konfetti", "feuerwerk"],
    fire: ["#ffd27a", "#ff5a1f"],
    fogFar: 34,
    crowd: 1,
  },
  synthwave: {
    id: "synthwave",
    label: "Synthwave",
    sky: "retro",
    floor: "raster",
    wall: "sonne",
    truss: "keine",
    tint: 0.6,
    colors: { accent: "#ff2bd6", dominant: "#22e6ff", dark: "#12021f" },
    lasers: true,
    headLevel: 0.85,
    effects: ["ringe", "funken", "flammen", "co2", "sternschnuppen"],
    fire: ["#ff7ae8", "#3ff0ff"],
    fogFar: 40,
    crowd: 0.6,
  },
  jazz: {
    id: "jazz",
    label: "Jazz-Keller",
    sky: "vorhang",
    floor: "holz",
    wall: "vorhang",
    truss: "bogen",
    tint: 0.55,
    colors: { accent: "#ffbf69", dominant: "#a8323e", dark: "#120806" },
    lasers: false,
    headLevel: 0.6,
    effects: ["glitzer", "funken"],
    fire: ["#fff1c9", "#ffbf69"],
    fogFar: 18,
    crowd: 0.3,
  },
  weltraum: {
    id: "weltraum",
    label: "Weltraum",
    sky: "sterne",
    floor: "mond",
    wall: "planet",
    truss: "bogen",
    tint: 0.4,
    colors: { accent: "#7df9ff", dominant: "#6a5cff", dark: "#03040c" },
    lasers: true,
    headLevel: 0.9,
    effects: ["sternschnuppen", "ringe", "co2", "pyro"],
    fire: ["#b9a4ff", "#46e8ff"],
    fogFar: 60,
    crowd: 0.45,
  },
};

/** Genre → Bühne (erste passende Regel gewinnt). */
const GENRE_THEME: Array<[RegExp, ThemeId]> = [
  [/jazz|soul|blues|swing|bossa|klassik|classical|chanson|acoustic|folk|singer.?songwriter/i, "jazz"],
  [/synthwave|retrowave|outrun|synth.?pop|new wave|italo|city pop|80s|vaporwave|j-?pop|k-?pop/i, "synthwave"],
  [/ambient|space|cosmic|chill|downtempo|lo-?fi|post-rock|shoegaze|trance|progressive/i, "weltraum"],
  [/techno|house|edm|electro|minimal|drum|bass|dubstep|hardstyle/i, "club"],
  [/rock|metal|punk|indie|grunge|pop|schlager|hip ?hop|rap|reggae|ska|festival|latin|reggaeton/i, "festival"],
];

/** Bühne für einen Song: feste Wahl, sonst Genre, sonst wechselnd nach Track. */
export function themeFor(song: Pick<SongStatic, "trackKey" | "music" | "artists">, choice: ThemeChoice = "auto"): ThemeId {
  if (choice !== "auto") return choice;
  const genres = [...song.music.genres, ...song.artists.flatMap((a) => a.genres ?? [])];
  for (const [re, id] of GENRE_THEME) if (genres.some((g) => re.test(g))) return id;
  const pool: ThemeId[] = ["club", "festival", "synthwave", "weltraum"];
  return pool[hash(song.trackKey) % pool.length]!;
}

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === "auto" || themeIds.includes(v as ThemeId);
}

function mixHex(a: string, b: string, w: number): string {
  const p = (h: string) => {
    const s = h.replace("#", "");
    const full = s.length === 3 ? [...s].map((c) => c + c).join("") : s.slice(0, 6);
    const n = parseInt(full, 16);
    return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [x, y] = [p(a), p(b)];
  return `#${x
    .map((v, i) => Math.round(v + (y[i]! - v) * w))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Cover-Palette in Richtung der Themenfarben verschieben (Song bleibt erkennbar, Bühne bekommt ihren Look). */
export function themedPalette(p: Palette, theme: Theme): Palette {
  if (theme.tint <= 0) return p;
  const w = theme.tint;
  return {
    dominant: mixHex(p.dominant, theme.colors.dominant, w),
    accent: mixHex(p.accent, theme.colors.accent, w),
    // der Hintergrund folgt dem Thema stärker (Abendhimmel, Weltall …)
    dark: mixHex(p.dark, theme.colors.dark, Math.min(1, w + 0.3)),
    light: p.light,
  };
}

export { mixHex };
