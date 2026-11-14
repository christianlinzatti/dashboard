import type { LyricLine, SongStatic } from "@/lib/song-context/schema";
import { lastStartedIndex } from "@/lib/song-context/derive";
import { easeInOut, lerp2, type Vec2 } from "./formations";
import type { CameraPreset, Choreography, Phrase } from "./plan";

export type Layer = { clip: string; time: number; weight: number };

export function phraseIndexAt(c: Choreography, t: number) {
  return Math.max(lastStartedIndex(c.phrases, t), 0);
}

function clipTime(c: Choreography, m: { clipStartMs: number; offsetBeats: number }, t: number, anchorMs: number | null) {
  // Clips sind auf 120 BPM gebaut: 1 Schlag = 0,5 s Clip-Zeit.
  // Mit Mikrofon: am gemessenen Beat-Raster ausgerichtet (Clips loopen über ganze Schläge).
  const base = anchorMs ?? m.clipStartMs;
  const v = ((t - base) / 1000) * c.timeScale + m.offsetBeats * 0.5;
  return anchorMs === null ? Math.max(0, v) : ((v % 96) + 96) % 96;
}

/** Clips für Drop-Momente (der erste, den der Avatar hat, wird genommen) */
const DROP_CLIPS = ["Dance_FestivalBounce", "Dance_PowerHit", "Dance_Shuffle", "Dance_Techno"];

export type LiveSync = { anchorMs?: number | null; dropMs?: number | null; clipsOf?: (avatarId: string) => ReadonlySet<string> };

/**
 * Animations-Ebenen eines Tänzers zur Songzeit t: Überblendung über einen Schlag beim Phrasenwechsel,
 * bei einem Drop für zwei Takte ein Höhepunkt-Clip (alle gemeinsam).
 */
export function layersAt(c: Choreography, avatarId: string, t: number, live: LiveSync = {}): Layer[] {
  const anchor = live.anchorMs ?? null;
  const i = phraseIndexAt(c, t);
  const p = c.phrases[i];
  const m = p?.moves[avatarId];
  if (!p || !m) return [];
  const prev = c.phrases[i - 1]?.moves[avatarId];
  const w = Math.min(Math.max((t - p.startMs) / c.beatMs, 0), 1);
  let layers: Layer[] =
    !prev || prev.clip === m.clip || w >= 1
      ? [{ clip: m.clip, time: clipTime(c, m, t, anchor), weight: 1 }]
      : [
          { clip: prev.clip, time: clipTime(c, prev, t, anchor), weight: 1 - w },
          { clip: m.clip, time: clipTime(c, m, t, anchor), weight: w },
        ];

  const drop = live.dropMs;
  if (drop != null && t >= drop && t < drop + 2 * c.barMs + c.beatMs) {
    const clips = live.clipsOf?.(avatarId);
    const peak = DROP_CLIPS.find((x) => !clips || clips.has(x));
    if (peak && peak !== m.clip) {
      const wIn = Math.min((t - drop) / c.beatMs, 1);
      const wOut = Math.min((drop + 2 * c.barMs + c.beatMs - t) / c.beatMs, 1);
      const pw = Math.max(0, Math.min(wIn, wOut));
      layers = [
        ...layers.map((l) => ({ ...l, weight: l.weight * (1 - pw) })),
        { clip: peak, time: clipTime(c, { clipStartMs: drop, offsetBeats: 0 }, t, anchor), weight: pw },
      ];
    }
  }
  return layers;
}

/** Zeitstrahl, wer gerade singt (aufeinanderfolgende Zeilen desselben Sängers zusammengefasst). */
export type FocusSegment = { startMs: number; artistId: string | undefined };

export function focusTimeline(song: SongStatic): FocusSegment[] {
  const lines: LyricLine[] = song.lyrics?.lines ?? [];
  const singers = song.lyrics?.singers ?? {};
  const out: FocusSegment[] = [];
  for (const l of lines) {
    const artistId = l.agent ? singers[l.agent] : undefined;
    if (out.at(-1)?.artistId !== artistId) out.push({ startMs: l.startMs, artistId });
  }
  return out;
}

const FOCUS_MS = 800;

function applyFocus(base: Record<string, Vec2>, order: string[], focusAvatar: string | undefined): Record<string, Vec2> {
  if (!focusAvatar || focusAvatar === order[0] || !base[focusAvatar]) return base;
  const lead = order[0]!;
  return { ...base, [focusAvatar]: base[lead]!, [lead]: base[focusAvatar]! };
}

/**
 * Positionen aller Tänzer zur Zeit t: Formationswechsel weich über einen Takt (max. 2 s),
 * der aktive Sänger tritt nach vorn (Platz des Leads).
 */
export function positionsAt(
  c: Choreography,
  t: number,
  focus: { timeline: FocusSegment[]; avatarOf: (artistId: string | undefined) => string | undefined },
): Record<string, Vec2> {
  const i = phraseIndexAt(c, t);
  const p = c.phrases[i]!;
  const prev = c.phrases[i - 1];
  const moveMs = Math.min(c.barMs, 2000);
  const w = easeInOut((t - p.startMs) / moveMs);
  const base: Record<string, Vec2> = {};
  for (const id of c.order) base[id] = prev ? lerp2(prev.positions[id]!, p.positions[id]!, w) : p.positions[id]!;

  const fi = lastStartedIndex(focus.timeline, t);
  if (fi < 0) return base;
  const cur = applyFocus(base, c.order, focus.avatarOf(focus.timeline[fi]!.artistId));
  const before = applyFocus(base, c.order, focus.avatarOf(focus.timeline[fi - 1]?.artistId));
  const fw = easeInOut((t - focus.timeline[fi]!.startMs) / FOCUS_MS);
  return Object.fromEntries(c.order.map((id) => [id, lerp2(before[id]!, cur[id]!, fw)]));
}

type Cam = { pos: readonly [number, number, number]; target: readonly [number, number, number] };

const CAMERA: Record<CameraPreset, Cam> = {
  totale: { pos: [0, 1.3, 6.6], target: [0, 0.45, 0] },
  halbnah: { pos: [0, 1.45, 5.3], target: [0, 0.95, 0] },
  untersicht: { pos: [0, 0.55, 5.4], target: [0, 1.0, 0] },
  seite: { pos: [2.6, 1.3, 5.6], target: [0, 0.6, 0] },
};

/** Kamera zur Zeit t: weicher Wechsel zwischen Einstellungen über einen Takt, dazu leichtes Schweben. */
export function cameraAt(c: Choreography, t: number): Cam {
  const i = phraseIndexAt(c, t);
  const p: Phrase | undefined = c.phrases[i];
  if (!p) return CAMERA.totale;
  const prev = c.phrases[i - 1];
  const a = CAMERA[prev?.camera ?? p.camera];
  const b = CAMERA[p.camera];
  const w = easeInOut((t - p.startMs) / Math.min(c.barMs * 1.5, 3000));
  const sway = Math.sin(t / 4000) * 0.25;
  const mix = (x: readonly number[], y: readonly number[]) => x.map((v, k) => v + (y[k]! - v) * w) as unknown as [number, number, number];
  const pos = mix(a.pos, b.pos);
  return { pos: [pos[0] + sway, pos[1], pos[2]], target: mix(a.target, b.target) };
}
