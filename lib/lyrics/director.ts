import { contiguous } from "@/lib/song-context/sections";
import { rng } from "@/lib/dance/rng";
import { lastStartedIndex } from "@/lib/song-context/derive";
import type { LyricLine, SectionKind, SongStatic } from "@/lib/song-context/schema";

export const lyricsModes = ["karaoke", "wortpop", "stapel", "schreibmaschine", "duett"] as const;
export type LyricsMode = (typeof lyricsModes)[number];

/** Wörter pro Sekunde einer Zeilengruppe – schnelle Parts (Rap) bekommen „Wort-Pop“. */
function wordsPerSecond(lines: LyricLine[]) {
  const words = lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0);
  const secs = lines.reduce((s, l) => s + Math.max(l.endMs - l.startMs, 1), 0) / 1000;
  return secs > 0 ? words / secs : 0;
}

/**
 * LyricsDirector: wählt pro Abschnitt eine Darstellung – Refrains auffällig und abwechselnd,
 * Strophen ruhig (Duett-Ansicht bei mehreren Sängern), Intro/Bridge als Schreibmaschine,
 * schnelle Parts als Wort-Pop. Deterministisch pro Song. Liefert den Modus je Zeile.
 */
export function planLyricsModes(song: SongStatic): LyricsMode[] {
  const lyrics = song.lyrics;
  if (!lyrics || lyrics.quality === "plain") return [];
  const lines = lyrics.lines;
  const hasWords = lines.some((l) => l.words?.length);
  if (!hasWords) return lines.map(() => "karaoke");

  const singers = new Set(lines.map((l) => (l.agent ? lyrics.singers?.[l.agent] : undefined)).filter(Boolean));
  const duet = song.track.isFeature && singers.size >= 2;
  const r = rng(`lyrics:${song.trackKey}`);
  const sections = contiguous(
    lyrics.sections.length ? lyrics.sections : [{ kind: "verse", startMs: 0, endMs: song.track.durationMs }],
    song.track.durationMs,
  );

  const sectionMode: LyricsMode[] = [];
  let lastChorus: LyricsMode | undefined;
  sections.forEach((sec, i) => {
    const secLines = lines.filter((l) => l.startMs >= sec.startMs && l.startMs < sec.endMs);
    const fast = wordsPerSecond(secLines) > 3.2;
    const prev = sectionMode[i - 1];
    let mode: LyricsMode;
    const kind: SectionKind = sec.kind;
    if (kind === "chorus") {
      const options: LyricsMode[] = ["stapel", "wortpop"].filter((m) => m !== lastChorus) as LyricsMode[];
      mode = r.pick(options.length ? options : ["stapel"]);
      lastChorus = mode;
    } else if (fast) mode = "wortpop";
    else if (kind === "verse") mode = duet ? "duett" : "karaoke";
    else if (kind === "bridge" || kind === "intro" || kind === "prechorus")
      mode = prev === "schreibmaschine" ? "karaoke" : "schreibmaschine";
    else mode = "karaoke";
    sectionMode.push(mode);
  });

  return lines.map((l) => {
    const i = Math.max(lastStartedIndex(sections, l.startMs), 0);
    return sectionMode[i] ?? "karaoke";
  });
}

/** Schrift-Effekte – unabhängig von der Darstellung (Karaoke, Stapel …) */
export const lyricsEffects = ["gluehen", "neon", "feuer", "welle", "echo", "glitch"] as const;
export type LyricsEffect = (typeof lyricsEffects)[number];

const ELECTRONIC = /techno|house|edm|electro|trance|drum|bass|dubstep|hip ?hop|rap|trap|synth/i;

/**
 * Schrift-Effekt je Zeile: Strophen ruhig (Glühen), Refrains wechselnd auffällig (Feuer, Neon, Echo),
 * Pre-Chorus als Welle, Bridge mit Echo, schnelle Parts elektronischer Songs als Glitch.
 * `style` kommt von der Bühne: „warm“ (Jazz) ohne Feuer/Glitch, „neon“ (Synthwave) bevorzugt Neon.
 */
export function planLyricsEffects(song: SongStatic, style: "normal" | "warm" | "neon" = "normal"): LyricsEffect[] {
  const lyrics = song.lyrics;
  if (!lyrics || lyrics.quality === "plain") return [];
  const lines = lyrics.lines;
  const r = rng(`lyrics-fx:${song.trackKey}`);
  const sections = contiguous(
    lyrics.sections.length ? lyrics.sections : [{ kind: "verse", startMs: 0, endMs: song.track.durationMs }],
    song.track.durationMs,
  );
  const genres = song.music.genres.length ? song.music.genres : song.artists.flatMap((a) => a.genres);
  const electronic = genres.some((g) => ELECTRONIC.test(g));
  const calm = song.music.mood === "ruhig" || style === "warm";
  const chorusPool: LyricsEffect[] = calm
    ? ["echo", "welle", "neon"]
    : style === "neon"
      ? ["neon", "echo", "feuer"]
      : ["feuer", "neon", "echo"];

  let lastChorus: LyricsEffect | undefined;
  const sectionEffect = sections.map((sec): LyricsEffect => {
    const secLines = lines.filter((l) => l.startMs >= sec.startMs && l.startMs < sec.endMs);
    // Regieanweisung (KI) für diese Abschnittsart; Refrains wechseln trotzdem zwischen Anweisung und Alternativen
    const directed = song.show?.sections.find((d) => d.kind === sec.kind)?.lyrics;
    if (sec.kind === "chorus") {
      // erster Refrain: der Leit-Effekt (Regie, sonst Bühne), danach abwechselnd
      const pool = directed ? [directed, ...chorusPool.filter((e) => e !== directed)] : chorusPool;
      const options = pool.filter((e) => e !== lastChorus);
      lastChorus = lastChorus === undefined ? pool[0]! : r.pick(options);
      return lastChorus;
    }
    if (directed) return directed;
    if (electronic && !calm && wordsPerSecond(secLines) > 3.2) return "glitch";
    if (sec.kind === "prechorus") return "welle";
    if (sec.kind === "bridge") return "echo";
    return "gluehen";
  });
  return lines.map((l) => sectionEffect[Math.max(lastStartedIndex(sections, l.startMs), 0)] ?? "gluehen");
}

/** Background-Vocals stehen in Klammern: „(oh-oh)“ – kleiner und kursiv darstellen. */
export function markBackground<T extends { text: string }>(words: T[]): Array<T & { bg: boolean }> {
  let depth = 0;
  return words.map((w) => {
    const opens = (w.text.match(/\(/g) ?? []).length;
    const closes = (w.text.match(/\)/g) ?? []).length;
    const bg = depth > 0 || opens > 0;
    depth = Math.max(0, depth + opens - closes);
    return { ...w, bg };
  });
}
