import type { SectionKind, SongStatic } from "@/lib/song-context/schema";

export const sectionLabel: Record<SectionKind, string> = {
  intro: "Intro",
  verse: "Strophe",
  prechorus: "Pre-Chorus",
  chorus: "Refrain",
  bridge: "Bridge",
  instrumental: "Instrumental",
  outro: "Outro",
};

export function lyricsLabel(song: SongStatic): string {
  switch (song.lyrics?.quality) {
    case "word":
      return "Wort-Sync";
    case "word-estimated":
      return "Wort-Sync (geschätzt)";
    case "line":
      return "Zeilen-Sync";
    case "plain":
      return "Text ohne Timing";
    default:
      return "Keine Lyrics";
  }
}

export function artistLine(song: SongStatic): string {
  const main = song.artists.filter((a) => a.role === "main").map((a) => a.name);
  const feat = song.artists.filter((a) => a.role === "feature").map((a) => a.name);
  return feat.length ? `${main.join(", ")} feat. ${feat.join(", ")}` : main.join(", ");
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
