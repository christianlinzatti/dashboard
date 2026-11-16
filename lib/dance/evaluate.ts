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

/** Kamera: Position, Blickziel und Bildwinkel (vertikal, Grad) */
export type Cam = { pos: readonly [number, number, number]; target: readonly [number, number, number]; fov: number };

const FOV = 36;
type V3 = readonly [number, number, number];

const CAMERA: Record<"totale" | "halbnah" | "untersicht" | "seite" | "vogel", Cam> = {
  // Totale vom Mischpult-Turm: weit hinten, leicht erhöht, Tele – die ersten Reihen des Publikums stehen unten im Bild
  totale: { pos: [0, 2.2, 10.2], target: [0, 0.62, 0], fov: 24 },
  halbnah: { pos: [0, 1.45, 5.3], target: [0, 0.95, 0], fov: FOV },
  untersicht: { pos: [0, 0.55, 5.4], target: [0, 1.0, 0], fov: FOV },
  seite: { pos: [2.6, 1.3, 5.6], target: [0, 0.6, 0], fov: FOV },
  vogel: { pos: [0, 7.6, 3.4], target: [0, 0.3, -0.3], fov: FOV },
};
const ZOOM_END: Cam = { pos: [0, 1.35, 3.9], target: [0, 1.0, 0], fov: FOV };

const mix3 = (x: V3, y: V3, w: number): [number, number, number] => [
  x[0] + (y[0] - x[0]) * w,
  x[1] + (y[1] - x[1]) * w,
  x[2] + (y[2] - x[2]) * w,
];

/** Anteil der Phrase zur Zeit t (0..1, geglättet) */
const phraseProgress = (p: Phrase, t: number) => easeInOut((t - p.startMs) / Math.max(p.endMs - p.startMs, 1));

/** Kamera einer Einstellung innerhalb ihrer Phrase; `focus` = Bodenposition des aktiven Sängers. */
function presetAt(preset: CameraPreset, p: Phrase, t: number, focus: Vec2 | undefined): Cam {
  switch (preset) {
    case "nah": {
      const [x, z] = focus ?? [0, 0];
      return { pos: [x * 0.6, 1.55, z + 2.3], target: [x, 1.42, z], fov: FOV };
    }
    case "kreisfahrt": {
      const a = 2 * Math.PI * phraseProgress(p, t);
      return { pos: [Math.sin(a) * 6.2, 1.7, Math.cos(a) * 6.2], target: [0, 0.8, 0], fov: FOV };
    }
    case "zoom": {
      const w = phraseProgress(p, t);
      return {
        pos: mix3(CAMERA.totale.pos, ZOOM_END.pos, w),
        target: mix3(CAMERA.totale.target, ZOOM_END.target, w),
        fov: CAMERA.totale.fov + (ZOOM_END.fov - CAMERA.totale.fov) * w,
      };
    }
    default:
      return CAMERA[preset];
  }
}

/**
 * Kamera zur Zeit t: weicher Wechsel zwischen Einstellungen (1,5 Takte, max. 3 s), dazu leichtes Schweben.
 * Kreisfahrt und Zoom bewegen sich über die ganze Phrase; die Nahaufnahme folgt dem aktiven Sänger.
 */
export function cameraAt(c: Choreography, t: number, focus?: Vec2): Cam {
  const i = phraseIndexAt(c, t);
  const p: Phrase | undefined = c.phrases[i];
  if (!p) return CAMERA.totale;
  const prev = c.phrases[i - 1];
  const a = prev ? presetAt(prev.camera, prev, t, focus) : presetAt(p.camera, p, t, focus);
  const b = presetAt(p.camera, p, t, focus);
  const w = easeInOut((t - p.startMs) / Math.min(c.barMs * 1.5, 3000));
  const sway = Math.sin(t / 4000) * (p.camera === "nah" ? 0.08 : 0.25);
  const pos = mix3(a.pos, b.pos, w);
  return { pos: [pos[0] + sway, pos[1], pos[2]], target: mix3(a.target, b.target, w), fov: a.fov + (b.fov - a.fov) * w };
}

/** Drehbühne: Drehwinkel (Rad, um die Hochachse) – eine volle Umdrehung über die Phrase, sonst 0. */
export function stageAngleAt(c: Choreography, t: number): number {
  const p = c.phrases[phraseIndexAt(c, t)];
  return p?.turn ? 2 * Math.PI * phraseProgress(p, t) : 0;
}

/** Bodenposition um die Bühnenmitte drehen (gleiche Richtung wie Object3D.rotation.y). */
export function rotateOnStage([x, z]: Vec2, angle: number): Vec2 {
  if (!angle) return [x, z];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [x * c + z * s, -x * s + z * c];
}
