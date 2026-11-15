import type { Derived, LyricLine, Playback, SongStatic } from "./schema";

export const emptyDerived: Derived = {
  lineIdx: -1,
  lineActive: false,
  wordIdx: -1,
  wordProgress: 0,
  section: null,
  isChorus: false,
  activeSingerId: undefined,
  secondsToNextLyric: null,
};

/** Aktuelle Songzeit aus dem letzten Spotify-Stand, lokal interpoliert. */
export function positionAt(pb: Playback, now: number, durationMs = Infinity): number {
  const elapsed = pb.isPlaying ? now - pb.updatedAt : 0;
  return Math.min(Math.max(pb.positionMs + elapsed, 0), durationMs);
}

/** Index des letzten Elements mit startMs <= t (binäre Suche), sonst -1. */
export function lastStartedIndex(items: ReadonlyArray<{ startMs: number }>, t: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid]!.startMs <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function wordState(line: LyricLine, t: number): { wordIdx: number; wordProgress: number } {
  const words = line.words;
  if (!words?.length) {
    const p = (t - line.startMs) / Math.max(line.endMs - line.startMs, 1);
    return { wordIdx: -1, wordProgress: clamp01(p) };
  }
  const idx = lastStartedIndex(words, t);
  if (idx < 0) return { wordIdx: -1, wordProgress: 0 };
  const w = words[idx]!;
  return {
    wordIdx: idx,
    wordProgress: w.syllables?.length
      ? syllableProgress(w.syllables, t)
      : clamp01((t - w.startMs) / Math.max(w.endMs - w.startMs, 1)),
  };
}

/**
 * Fortschritt im Wort entlang der Silben, gewichtet nach Zeichen: „e|nough“ füllt erst das „e“ in dessen Zeit,
 * dann „nough“ in seiner – auch wenn die Silben unterschiedlich lang gesungen werden.
 */
export function syllableProgress(syllables: Array<{ startMs: number; endMs: number; text: string }>, t: number): number {
  const total = syllables.reduce((n, s) => n + Math.max(s.text.length, 1), 0);
  let done = 0;
  for (const s of syllables) {
    const len = Math.max(s.text.length, 1);
    if (t < s.startMs) break;
    done += len * clamp01((t - s.startMs) / Math.max(s.endMs - s.startMs, 1));
    if (t < s.endMs) break;
  }
  return clamp01(done / total);
}

/**
 * Leitet aus Stammdaten und Songzeit (bereits um den Offset korrigiert) ab,
 * welche Zeile/welches Wort aktiv ist, in welchem Abschnitt wir sind und wer singt.
 */
export function derive(song: SongStatic | null, t: number): Derived {
  if (!song) return emptyDerived;
  const sections = song.lyrics?.sections ?? [];
  const sIdx = lastStartedIndex(sections, t);
  const sec = sIdx >= 0 && t < sections[sIdx]!.endMs ? sections[sIdx]! : null;
  const base: Derived = { ...emptyDerived, section: sec?.kind ?? null, isChorus: sec?.kind === "chorus" };

  const lines = song.lyrics?.lines ?? [];
  if (!lines.length || song.lyrics?.quality === "plain") return base;

  const lineIdx = lastStartedIndex(lines, t);
  const line = lineIdx >= 0 ? lines[lineIdx]! : undefined;
  const lineActive = !!line && t < line.endMs;
  const next = lines[lineIdx + 1];
  const singers = song.lyrics?.singers;
  const activeSingerId = lineActive && line?.agent && singers ? singers[line.agent] : undefined;

  return {
    ...base,
    lineIdx,
    lineActive,
    ...(lineActive && line ? wordState(line, t) : { wordIdx: -1, wordProgress: 0 }),
    activeSingerId,
    secondsToNextLyric: !lineActive && next ? (next.startMs - t) / 1000 : null,
  };
}

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
