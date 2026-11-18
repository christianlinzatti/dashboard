import type { LyricLine, LyricWord, SongStatic } from "@/lib/song-context/schema";

/**
 * Lippensynchron aus den Lyrics: Jedes Wort wird an seinen Vokalen in Silben geteilt (oder nimmt die Silben mit
 * eigenem Timing), jede Silbe bekommt eine Mundform. Funktioniert ohne Mikrofon; mit Mikrofon moduliert die
 * gemessene Gesangslautstärke die Öffnung (im Avatar). Rein und deterministisch.
 */
export type Mouth = {
  /** 0 = geschlossen … 1 = weit offen */
  open: number;
  /** 0 = breit (e, i) … 1 = rund (o, u) */
  round: number;
};

export type MouthSegment = { startMs: number; endMs: number; open: number; round: number };

export const CLOSED: Mouth = { open: 0, round: 0 };

/** Mundform eines Vokals (erster Buchstabe der Vokalgruppe zählt) */
function shapeOf(vowel: string): Pick<Mouth, "open" | "round"> {
  const v = vowel.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()[0] ?? "a";
  switch (v) {
    case "a":
      return { open: 1, round: 0.2 };
    case "o":
      return { open: 0.8, round: 1 };
    case "u":
      return { open: 0.5, round: 1 };
    case "e":
      return { open: 0.65, round: 0 };
    case "i":
    case "y":
      return { open: 0.45, round: 0 };
    default:
      return { open: 0.6, round: 0.4 };
  }
}

const VOWELS = /[aeiouyäöüàáâãåæèéêëìíîïòóôõøùúûāēīōū]+/gi;

/** Silben eines Wortes: Vokalgruppen; ohne lateinische Vokale (z. B. Kana) jedes Zeichen eine Silbe */
export function syllablesOf(text: string): Array<Pick<Mouth, "open" | "round">> {
  const groups = text.match(VOWELS);
  if (groups?.length) return groups.map(shapeOf);
  const chars = [...text.replace(/[\s\p{P}]/gu, "")];
  return chars.length ? chars.map(() => ({ open: 0.7, round: 0.4 })) : [];
}

/** Mundbewegung eines Wortes: Silben mit eigenem Timing, sonst gleichmäßig über das Wort verteilt */
function wordSegments(w: LyricWord): MouthSegment[] {
  if (w.syllables?.length)
    return w.syllables.flatMap((s) => {
      const shape = syllablesOf(s.text)[0];
      return shape && s.endMs > s.startMs ? [{ startMs: s.startMs, endMs: s.endMs, ...shape }] : [];
    });
  const parts = syllablesOf(w.text);
  const dur = w.endMs - w.startMs;
  if (!parts.length || dur <= 0) return [];
  const slot = dur / parts.length;
  return parts.map((p, k) => ({ startMs: w.startMs + k * slot, endMs: w.startMs + (k + 1) * slot, ...p }));
}

/** Wörter einer Zeile: Umschrift mit Timing (z. B. Rōmaji) vor dem Original; ohne Wort-Timing nach Zeichenzahl verteilt */
function wordsOf(line: LyricLine): LyricWord[] {
  const timed = line.transliteration?.words?.length ? line.transliteration.words : line.words;
  if (timed?.length) return timed;
  const text = line.transliteration?.text ?? line.text;
  const words = text.split(/\s+/).filter(Boolean);
  const total = words.reduce((n, w) => n + w.length, 0) || 1;
  const dur = line.endMs - line.startMs;
  let t = line.startMs;
  return words.map((w) => {
    const d = (dur * w.length) / total;
    const out = { startMs: t, endMs: t + d, text: w };
    t += d;
    return out;
  });
}

export function lineSegments(line: LyricLine): MouthSegment[] {
  return wordsOf(line).flatMap(wordSegments);
}

/**
 * Mundbewegung je Avatar für den ganzen Song. Zeilen gehören dem Sänger ihres `agent` (Feature-Songs), sonst
 * dem Lead. Im Refrain singt die übrige Crew leiser mit.
 */
export function lipsyncTracks(
  song: Pick<SongStatic, "lyrics" | "cast">,
  avatarOfArtist: (artistId: string | undefined) => string | undefined,
): Map<string, MouthSegment[]> {
  const out = new Map<string, MouthSegment[]>();
  const lyrics = song.lyrics;
  const lead = song.cast.find((c) => c.role === "lead")?.avatarId ?? song.cast[0]?.avatarId;
  if (!lyrics || !lead) return out;
  const chorus = (t: number) => lyrics.sections.some((s) => s.kind === "chorus" && t >= s.startMs && t < s.endMs);
  const push = (id: string, segs: MouthSegment[]) => out.set(id, [...(out.get(id) ?? []), ...segs]);
  for (const line of lyrics.lines) {
    const singer = (line.agent ? avatarOfArtist(lyrics.singers?.[line.agent]) : undefined) ?? lead;
    const segs = lineSegments(line);
    push(singer, segs);
    if (chorus(line.startMs))
      for (const c of song.cast)
        if (c.avatarId !== singer)
          push(
            c.avatarId,
            segs.map((s) => ({ ...s, open: s.open * 0.45 })),
          );
  }
  for (const segs of out.values()) segs.sort((a, b) => a.startMs - b.startMs);
  return out;
}

/** Mund zur Zeit t: Silbe öffnet schnell, schließt zum Ende; zwischen den Silben fast zu. */
export function mouthAt(track: readonly MouthSegment[] | undefined, t: number): Mouth {
  if (!track?.length) return CLOSED;
  let lo = 0;
  let hi = track.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (track[mid]!.startMs <= t) lo = mid;
    else hi = mid - 1;
  }
  const s = track[lo]!;
  if (t < s.startMs || t >= s.endMs) return CLOSED;
  const u = (t - s.startMs) / Math.max(s.endMs - s.startMs, 1);
  const env = Math.min(1, u / 0.2) * Math.min(1, (1 - u) / 0.35 + 0.15);
  return { open: s.open * Math.max(0, env), round: s.round };
}
