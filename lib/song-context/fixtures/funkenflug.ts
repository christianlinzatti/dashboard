import type { SongStatic } from "../schema";
import { line, section } from "./helpers";

// Demo-Song mit frei erfundenem Text: Rock mit Band (Gitarre, Bass, Schlagzeug) und Instrumentalteil –
// zeigt das Band-Solo (erst Gitarre, dann Schlagzeug) mit Verfolger.
export const funkenflug: SongStatic = {
  schemaVersion: 1,
  trackKey: "demo-funkenflug",
  track: { spotifyId: "demo-funkenflug", title: "Funkenflug", durationMs: 100_000, explicit: false, isFeature: false },
  artists: [
    {
      spotifyId: "demo-funkenflieger",
      name: "Die Funkenflieger",
      role: "main",
      genres: ["rock", "indie rock"],
      images: [],
      avatarId: "festival-nova",
      color: "#ff5a36",
    },
  ],
  album: {
    name: "Laut ist leise genug",
    coverUrl: "/demo/funkenflug.svg",
    palette: { dominant: "#e2391b", accent: "#ffb21f", dark: "#1a0705", light: "#fff3e0" },
  },
  music: { bpmHint: 132, genres: ["rock", "indie rock"], mood: "energetisch" },
  lyrics: {
    provider: "demo",
    quality: "word",
    sections: [
      section("intro", 0, 8),
      section("verse", 8, 28),
      section("chorus", 28, 44),
      section("instrumental", 44, 59),
      section("instrumental", 59, 74),
      section("chorus", 74, 90),
      section("outro", 90, 100),
    ],
    lines: [
      line(8.5, 12.5, "Die Straße glüht, der Motor schreit"),
      line(13, 17.5, "wir fahren los, es ist so weit"),
      line(18.5, 22.5, "die Stadt wird klein im Rückspiegel"),
      line(23, 27.5, "und vor uns brennt der Horizont"),
      line(28.5, 32, "Funkenflug, Funkenflug"),
      line(32.5, 36.5, "wir haben nie genug"),
      line(37, 40.5, "dreh das Licht auf, dreh es laut"),
      line(41, 43.8, "bis der Himmel taut"),
      line(74.5, 78, "Funkenflug, Funkenflug"),
      line(78.5, 82.5, "wir haben nie genug"),
      line(83, 86.5, "dreh das Licht auf, dreh es laut"),
      line(87, 89.8, "bis der Himmel taut"),
    ],
  },
  cast: [
    { avatarId: "festival-nova", artistId: "demo-funkenflieger", role: "lead", position: 0 },
    { avatarId: "mc-flow", role: "backup", position: -1 },
    { avatarId: "atlas-prism", role: "backup", position: 1 },
  ],
  status: {
    spotify: { state: "ok", provider: "demo" },
    lyrics: { state: "ok", provider: "demo", detail: "Wort-Sync" },
    music: { state: "ok", provider: "demo" },
    info: { state: "missing" },
    palette: { state: "ok", provider: "demo" },
  },
};
