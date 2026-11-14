import type { SongStatic } from "../schema";

// Demo-Song ohne Lyrics (Instrumental), elektronisch.
export const instrumental: SongStatic = {
  schemaVersion: 1,
  trackKey: "demo-pulsar",
  track: { spotifyId: "demo-pulsar", title: "Pulsar", durationMs: 240_000, explicit: false, isFeature: false },
  artists: [
    {
      spotifyId: "demo-volt",
      name: "VOLTKRAFT",
      role: "main",
      genres: ["techno"],
      images: [],
      avatarId: "neon-pulse",
      color: "#39ff88",
    },
  ],
  album: {
    name: "Frequenzen",
    coverUrl: "/demo/pulsar.svg",
    palette: { dominant: "#0fd27a", accent: "#39ff88", dark: "#03140c", light: "#e6fff2" },
  },
  music: { bpmHint: 132, genres: ["techno"], mood: "energetisch" },
  cast: [
    { avatarId: "neon-pulse", artistId: "demo-volt", role: "lead", position: 0 },
    { avatarId: "quantum-bass", role: "backup", position: -1 },
    { avatarId: "chrome-beat", role: "backup", position: 1 },
  ],
  status: {
    spotify: { state: "ok", provider: "demo" },
    lyrics: { state: "missing", detail: "Keine Lyrics gefunden" },
    music: { state: "ok", provider: "demo" },
    info: { state: "missing" },
    palette: { state: "ok", provider: "demo" },
  },
};
