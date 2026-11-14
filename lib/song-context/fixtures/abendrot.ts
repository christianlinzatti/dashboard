import type { SongStatic } from "../schema";
import { line, section } from "./helpers";

// Demo-Song mit frei erfundenem Text: ein Artist, nur Zeilen-Sync, ruhig.
export const abendrot: SongStatic = {
  schemaVersion: 1,
  trackKey: "demo-abendrot",
  track: { spotifyId: "demo-abendrot", title: "Abendrot am Hafen", durationMs: 180_000, explicit: false, isFeature: false },
  artists: [
    { spotifyId: "demo-lena", name: "Lena Brandt", role: "main", genres: ["jazz", "soul"], images: [], avatarId: "velvet-jazz", color: "#ffb347" },
  ],
  album: {
    name: "Leise Wellen",
    coverUrl: "/demo/abendrot.svg",
    palette: { dominant: "#ff7a3d", accent: "#ffd27a", dark: "#2a0f08", light: "#fff1e0" },
  },
  music: { bpmHint: 84, genres: ["jazz", "soul"], mood: "ruhig" },
  lyrics: {
    provider: "demo",
    quality: "line",
    sections: [section("intro", 0, 10), section("verse", 10, 42), section("chorus", 42, 62), section("outro", 62, 180)],
    lines: [
      line(10.5, 15, "Am Hafen färbt der Himmel sich", undefined, false),
      line(15.5, 20, "die Möwen ziehen still vorbei", undefined, false),
      line(21, 26, "ich warte hier und denk an dich", undefined, false),
      line(26.5, 31, "der Abend macht die Seele frei", undefined, false),
      line(42.5, 47.5, "Abendrot, nimm mich mit", undefined, false),
      line(48, 53, "über's Wasser, Schritt für Schritt", undefined, false),
      line(53.5, 59, "bis die Sterne leuchten", undefined, false),
    ],
  },
  cast: [
    { avatarId: "velvet-jazz", artistId: "demo-lena", role: "lead", position: 0 },
    { avatarId: "sol-groove", role: "backup", position: -1 },
    { avatarId: "luna-flow", role: "backup", position: 1 },
  ],
  status: {
    spotify: { state: "ok", provider: "demo" },
    lyrics: { state: "ok", provider: "demo", detail: "Zeilen-Sync" },
    music: { state: "ok", provider: "demo" },
    info: { state: "missing" },
    palette: { state: "ok", provider: "demo" },
  },
};
