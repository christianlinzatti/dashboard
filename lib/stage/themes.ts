import { hash } from "@/lib/avatars/casting";
import type { Palette, SongStatic } from "@/lib/song-context/schema";

/**
 * Bühnen-Themen: Kulisse, Farbstimmung und erlaubte Spezialeffekte.
 * Auswahl nach Genre (oder fest in den Einstellungen); ohne passendes Genre wechselt die Bühne
 * von Song zu Song (deterministisch nach Track) – so bleibt es abwechslungsreich.
 */
export const themeIds = [
  "club",
  "festival",
  "synthwave",
  "jazz",
  "weltraum",
  "stadion",
  "strand",
  "lagerhalle",
  "kathedrale",
] as const;
export type ThemeId = (typeof themeIds)[number];
export type ThemeChoice = ThemeId | "auto";

export const effectKinds = [
  "pyro",
  "funken",
  "flammen",
  "co2",
  "konfetti",
  "schaum",
  "feuerwerk",
  "ringe",
  "sternschnuppen",
  "glitzer",
  "luftschlangen",
] as const;
export type EffectKind = (typeof effectKinds)[number];

export type Theme = {
  id: ThemeId;
  label: string;
  /** Hintergrund: einfarbig (Club), Abendhimmel, Synthwave-Sonne, Vorhang, Sternenhimmel, Stadionnacht, Sonnenuntergang am Meer */
  sky: "dunkel" | "abend" | "retro" | "vorhang" | "sterne" | "nacht" | "strand";
  floor: "spiegel" | "buehne" | "raster" | "holz" | "mond" | "sand" | "beton" | "stein";
  /** Rückwand: LED-Wand, Retro-Sonne, Vorhang (ohne Wand), Planet, Meer, Betonwand mit Leuchtröhren, Kirchenfenster */
  wall: "led" | "sonne" | "vorhang" | "planet" | "meer" | "beton" | "kirche";
  truss: "club" | "dach" | "keine" | "bogen" | "stadion" | "stahl";
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
    effects: ["co2", "funken", "flammen", "ringe", "konfetti", "schaum", "luftschlangen"],
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
    effects: ["pyro", "funken", "flammen", "co2", "konfetti", "schaum", "feuerwerk", "luftschlangen"],
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
    effects: ["ringe", "funken", "flammen", "co2", "konfetti", "sternschnuppen"],
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
  stadion: {
    id: "stadion",
    label: "Stadion",
    sky: "nacht",
    floor: "buehne",
    wall: "led",
    truss: "stadion",
    tint: 0.15,
    colors: { accent: "#ffffff", dominant: "#3a7bff", dark: "#05070f" },
    lasers: true,
    headLevel: 1,
    effects: ["pyro", "funken", "flammen", "co2", "konfetti", "feuerwerk", "luftschlangen"],
    fire: ["#ffe2a0", "#ff6a1f"],
    fogFar: 60,
    crowd: 1,
  },
  strand: {
    id: "strand",
    label: "Strand",
    sky: "strand",
    floor: "sand",
    wall: "meer",
    truss: "keine",
    tint: 0.3,
    colors: { accent: "#ffcf5c", dominant: "#ff5e7a", dark: "#1a0f24" },
    lasers: false,
    headLevel: 0.8,
    effects: ["schaum", "konfetti", "funken", "ringe", "feuerwerk", "luftschlangen"],
    fire: ["#fff0b8", "#ff8a3d"],
    fogFar: 55,
    crowd: 0.7,
  },
  lagerhalle: {
    id: "lagerhalle",
    label: "Lagerhalle",
    sky: "dunkel",
    floor: "beton",
    wall: "beton",
    truss: "stahl",
    tint: 0.5,
    colors: { accent: "#ff2a2a", dominant: "#e8e8f0", dark: "#070606" },
    lasers: true,
    headLevel: 1,
    effects: ["co2", "flammen", "funken", "ringe", "luftschlangen"],
    fire: ["#ffffff", "#ff3020"],
    fogFar: 18,
    crowd: 0.85,
  },
  kathedrale: {
    id: "kathedrale",
    label: "Kathedrale",
    sky: "dunkel",
    floor: "stein",
    wall: "kirche",
    truss: "keine",
    tint: 0.45,
    colors: { accent: "#ffcf7a", dominant: "#3b4fb8", dark: "#07060c" },
    lasers: false,
    headLevel: 0.7,
    effects: ["funken", "co2", "ringe"],
    fire: ["#fff4d6", "#ffc46b"],
    fogFar: 26,
    crowd: 0.5,
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

/** Bühnen mit Traverse/Dach, an dem Blinder hängen */
export const hasBlinders = (t: Theme) => t.truss === "club" || t.truss === "dach" || t.truss === "stadion" || t.truss === "stahl";

/** Genre → Bühne (erste passende Regel gewinnt). */
const GENRE_THEME: Array<[RegExp, ThemeId]> = [
  [/klassik|classical|orchest|choir|chor|gospel|sacred|requiem|gregorian|a cappella|symphonic|gothic|organ/i, "kathedrale"],
  [/jazz|soul|blues|swing|bossa|chanson|acoustic|folk|singer.?songwriter/i, "jazz"],
  [/reggae|reggaeton|dancehall|latin|salsa|samba|tropical|afrobeat|calypso|soca|surf|beach|island/i, "strand"],
  [/techno|industrial|minimal|ebm|hard ?style|warehouse|acid/i, "lagerhalle"],
  [/stadium|arena rock|anthem|schlager|britpop|pop rock/i, "stadion"],
  [/synthwave|retrowave|outrun|synth.?pop|new wave|italo|city pop|80s|vaporwave|j-?pop|k-?pop/i, "synthwave"],
  [/ambient|space|cosmic|chill|downtempo|lo-?fi|post-rock|shoegaze|trance|progressive/i, "weltraum"],
  [/house|edm|electro|drum|bass|dubstep|disco|trance/i, "club"],
  [/rock|metal|punk|indie|grunge|pop|hip ?hop|rap|ska|festival/i, "festival"],
];

/** Verwandte Bühnen: Ausweichziel, wenn der vorige Song schon auf dieser Bühne lief (Jazz bleibt Jazz). */
const RELATED: Record<ThemeId, ThemeId[]> = {
  club: ["synthwave", "weltraum", "festival"],
  festival: ["club", "synthwave"],
  synthwave: ["club", "weltraum"],
  jazz: [],
  weltraum: ["synthwave", "club"],
  stadion: ["festival", "club"],
  strand: ["festival", "synthwave"],
  lagerhalle: ["club", "weltraum"],
  kathedrale: [],
};

/**
 * Bühne für einen Song: feste Wahl, sonst Regie (KI), Genre oder wechselnd nach Track.
 * Lief der vorige Song des Abends schon auf derselben Bühne, wird auf eine verwandte gewechselt –
 * so wird ein Techno-Set nicht zu einer einzigen langen Club-Nacht.
 */
export function themeFor(
  song: Pick<SongStatic, "trackKey" | "music" | "artists"> & Partial<Pick<SongStatic, "show" | "variant">>,
  choice: ThemeChoice = "auto",
  previous?: ThemeId,
  /** Tour-Look: Bühne, auf der derselbe Künstler heute schon stand – er kommt wieder dorthin */
  tour?: ThemeId,
): ThemeId {
  if (choice !== "auto") return choice;
  if (tour) return tour;
  const id = baseTheme(song);
  const alt = RELATED[id];
  return id === previous && alt.length ? alt[hash(`${song.trackKey}:setlist`) % alt.length]! : id;
}

function baseTheme(
  song: Pick<SongStatic, "trackKey" | "music" | "artists"> & Partial<Pick<SongStatic, "show" | "variant">>,
): ThemeId {
  // die Regie (KI) kennt den Song
  if (song.show) return song.show.stage;
  const genres = [...song.music.genres, ...song.artists.flatMap((a) => a.genres ?? [])];
  for (const [re, id] of GENRE_THEME) if (genres.some((g) => re.test(g))) return id;
  const pool: ThemeId[] = ["club", "festival", "synthwave", "weltraum", "stadion", "strand", "lagerhalle"];
  // ohne Genre: wechselnd je Song – und mit der Tagesform jeden Tag anders
  return pool[hash(`${song.trackKey}${song.variant ?? ""}`) % pool.length]!;
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
