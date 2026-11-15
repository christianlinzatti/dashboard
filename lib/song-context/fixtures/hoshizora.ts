import type { LyricLine, SongStatic } from "../schema";
import { line, section } from "./helpers";

/**
 * Demo-Song mit frei erfundenem japanischem Text (keine echten Lyrics), Umschrift (Rōmaji) mit eigenem
 * Wort-Timing und deutscher Übersetzung – wie Better Lyrics sie aus Apple-Music-TTML liefert.
 */
function jp(startS: number, endS: number, text: string, romaji: string, deutsch: string): LyricLine {
  return {
    ...line(startS, endS, text),
    transliteration: { text: romaji, words: line(startS, endS, romaji).words },
    translation: deutsch,
  };
}

export const hoshizora: SongStatic = {
  schemaVersion: 1,
  trackKey: "demo-hoshizora",
  track: { spotifyId: "demo-hoshizora", title: "星空ランナー", durationMs: 150_000, explicit: false, isFeature: false },
  artists: [
    {
      spotifyId: "demo-yume",
      name: "Yume Aoi",
      role: "main",
      genres: ["j-pop"],
      images: [],
      avatarId: "luna-flow",
      color: "#ffd54a",
    },
  ],
  album: {
    name: "夜明けまで",
    coverUrl: "/demo/hoshizora.svg",
    palette: { dominant: "#5b2a86", accent: "#ffd54a", dark: "#0b0a24", light: "#fff6d6" },
  },
  music: { bpmHint: 132, genres: ["j-pop"], mood: "energetisch" },
  lyrics: {
    provider: "demo",
    quality: "word",
    transliterationLang: "ja-Latn",
    translationLang: "de",
    sections: [section("intro", 0, 8), section("verse", 8, 30), section("chorus", 30, 52), section("outro", 52, 150)],
    lines: [
      jp(8.5, 13, "夜空に 光る 星の かけら", "yozora ni hikaru hoshi no kakera", "Sternensplitter leuchten am Nachthimmel"),
      jp(13.5, 18, "君と 歩いた 坂道", "kimi to aruita sakamichi", "der Hang, den ich mit dir hinaufging"),
      jp(19, 24, "消えない 歌を 響かせて", "kienai uta wo hibikasete", "lass ein Lied erklingen, das nie verklingt"),
      jp(24.5, 29, "明日へ 走り出そう", "ashita e hashiridasou", "lass uns losrennen, dem Morgen entgegen"),
      jp(30.5, 35, "星空 ランナー 止まらない", "hoshizora rannā tomaranai", "Sternenhimmel-Läufer, nicht aufzuhalten"),
      jp(35.5, 40, "夢の 続きへ 飛び込め", "yume no tsuzuki e tobikome", "spring hinein in die Fortsetzung des Traums"),
      jp(41, 46, "星空 ランナー 輝いて", "hoshizora rannā kagayaite", "Sternenhimmel-Läufer, leuchte"),
      jp(46.5, 51, "夜明けまで 一緒に", "yoake made issho ni", "zusammen bis zum Morgengrauen"),
    ],
  },
  cast: [
    { avatarId: "luna-flow", artistId: "demo-yume", role: "lead", position: 0 },
    { avatarId: "festival-nova", role: "backup", position: -1 },
    { avatarId: "aurora-synth", role: "backup", position: 1 },
  ],
  status: {
    spotify: { state: "ok", provider: "demo" },
    lyrics: { state: "ok", provider: "demo", detail: "Wort-Sync, Umschrift, Übersetzung" },
    music: { state: "ok", provider: "demo" },
    info: { state: "missing" },
    palette: { state: "ok", provider: "demo" },
  },
};
