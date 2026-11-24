import type { LyricLine, SongStatic } from "@/lib/song-context/schema";
import { lastStartedIndex } from "@/lib/song-context/derive";
import { easeInOut, lerp2, type Vec2 } from "./formations";
import type { CameraPreset, Choreography, Phrase } from "./plan";
import { danceTime, SLOWMO_BARS } from "@/lib/stage/climax";
import { IDLE_CLIP } from "./clips";

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

/** Gehen beim Auftritt, Winken zum Abschied (Mixamo, siehe mixamo-loader) */
export const WALK_CLIP = "Mixamo_StandardWalk";
export const FAREWELL_CLIP = "Mixamo_Waving";
export const STAGE_CLIPS = [WALK_CLIP, FAREWELL_CLIP];
/** Auftritt: so viele Takte vom Songstart; Abgang: Winken und Verbeugung in den letzten Takten */
export const ENTRANCE_BARS = 3;
export const EXIT_BARS = 2;
/** von wie weit seitlich die Crew auf die Bühne kommt */
const OFFSTAGE_X = 6.5;

/**
 * Auftritt eines Tänzers zur Zeit t: 0 = noch hinter der Bühne, 1 = am Platz. Die Crew kommt nacheinander
 * (je zwei Schläge versetzt), der Lead zuletzt. Außerhalb des Auftritts 1.
 */
export function entranceAt(c: Choreography, avatarId: string, t: number): number {
  const total = ENTRANCE_BARS * c.barMs;
  if (t >= total) return 1;
  const n = c.order.length;
  const rank = (c.order.indexOf(avatarId) + n - 1) % n; // Crew zuerst, Lead (Index 0) zuletzt
  const delay = rank * 2 * c.beatMs;
  const walk = total - (n - 1) * 2 * c.beatMs;
  return Math.min(Math.max((t - delay) / Math.max(walk, 1), 0), 1);
}

/** Abgang zur Zeit t: null, oder Winken (vorletzter Takt) bzw. Verbeugung (letzter Takt) mit Fortschritt 0..1 */
export function exitAt(c: Choreography, t: number): { phase: "winken" | "verbeugen"; u: number } | null {
  const end = c.durationMs ?? 0;
  const start = end - EXIT_BARS * c.barMs;
  if (!end || t < start || t >= end) return null;
  const bar = (t - start) / c.barMs;
  return bar < EXIT_BARS - 1 ? { phase: "winken", u: bar / (EXIT_BARS - 1) } : { phase: "verbeugen", u: bar - (EXIT_BARS - 1) };
}

/** Verbeugung: Vorbeugen des Oberkörpers (Rad) – hin und zurück über den letzten Takt */
export function bowAngleAt(c: Choreography, t: number): number {
  const e = exitAt(c, t);
  if (e?.phase !== "verbeugen") return 0;
  return 0.75 * Math.sin(Math.PI * Math.min(e.u * 1.15, 1));
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
  // Finale: Zeitlupe – die Tanz-Zeit läuft erst langsamer und holt dann auf (Phrasenwahl bleibt bei der Songzeit)
  const tc = danceTime(c.climaxes ?? [], t, c.barMs);
  let layers: Layer[] =
    !prev || prev.clip === m.clip || w >= 1
      ? [{ clip: m.clip, time: clipTime(c, m, tc, anchor), weight: 1 }]
      : [
          { clip: prev.clip, time: clipTime(c, prev, tc, anchor), weight: 1 - w },
          { clip: m.clip, time: clipTime(c, m, tc, anchor), weight: w },
        ];

  // Auftritt: gehen, kurz vor dem Ziel in den Tanz überblenden
  const arrive = entranceAt(c, avatarId, t);
  if (arrive < 1) {
    const walk = { clip: WALK_CLIP, time: t / 1000, weight: 1 };
    const wDance = Math.max(0, (arrive - 0.8) / 0.2);
    return wDance > 0 ? [{ ...walk, weight: 1 - wDance }, ...layers.map((l) => ({ ...l, weight: l.weight * wDance }))] : [walk];
  }
  // Abgang: alle winken gemeinsam, dann Verbeugung (Grundhaltung; das Vorbeugen setzt der Avatar)
  const exit = exitAt(c, t);
  if (exit) {
    const into = exit.phase === "winken" ? Math.min(exit.u * 4, 1) : 1;
    const target =
      exit.phase === "winken"
        ? { clip: FAREWELL_CLIP, time: (t - (c.durationMs - EXIT_BARS * c.barMs)) / 1000, weight: into }
        : { clip: IDLE_CLIP, time: t / 1000, weight: 1 };
    return into < 1 ? [...layers.map((l) => ({ ...l, weight: l.weight * (1 - into) })), target] : [target];
  }

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

  // Auftritt: von der Seite auf den Platz gehen (Seite nach Platz; Lead von links)
  if (t < ENTRANCE_BARS * c.barMs)
    for (const id of c.order) {
      const u = entranceAt(c, id, t);
      if (u >= 1) continue;
      const [x, z] = base[id]!;
      const from = (x > 0.01 ? 1 : -1) * OFFSTAGE_X;
      base[id] = [from + (x - from) * easeOutWalk(u), z];
    }

  const fi = lastStartedIndex(focus.timeline, t);
  if (fi < 0) return base;
  const cur = applyFocus(base, c.order, focus.avatarOf(focus.timeline[fi]!.artistId));
  const before = applyFocus(base, c.order, focus.avatarOf(focus.timeline[fi - 1]?.artistId));
  const fw = easeInOut((t - focus.timeline[fi]!.startMs) / FOCUS_MS);
  return Object.fromEntries(c.order.map((id) => [id, lerp2(before[id]!, cur[id]!, fw)]));
}

/** Gehen: fast gleichmäßig, am Ende abbremsen */
const easeOutWalk = (u: number) => (u < 0.8 ? u * 1.05 : 0.84 + 0.16 * Math.sin(((u - 0.8) / 0.2) * (Math.PI / 2)));

/**
 * Blickrichtung (Rad um die Hochachse) beim Auftritt: in Gehrichtung zur Bühnenmitte, kurz vor dem Ziel zum
 * Publikum drehen. Sonst 0 (nach vorn).
 */
export function headingAt(c: Choreography, avatarId: string, t: number, x: number): number {
  const u = entranceAt(c, avatarId, t);
  if (u >= 1) return 0;
  const walkDir = x > 0.01 ? -Math.PI / 2 : Math.PI / 2; // von rechts nach links bzw. umgekehrt
  const turn = Math.max(0, (u - 0.8) / 0.2);
  return walkDir * (1 - easeInOut(turn));
}

/** Kamera: Position, Blickziel und Bildwinkel (vertikal, Grad) */
export type Cam = { pos: readonly [number, number, number]; target: readonly [number, number, number]; fov: number };

const FOV = 36;
type V3 = readonly [number, number, number];

const CAMERA: Record<"totale" | "halbnah" | "untersicht" | "seite" | "vogel" | "ueberkopf", Cam> = {
  // aus dem Publikum: zwischen den Köpfen der Menge, Blick auf die Bühne
  ueberkopf: { pos: [0.5, 0.95, 9.2], target: [0, 1.1, 0], fov: 30 },
  // Totale vom Mischpult-Turm: weit hinten, leicht erhöht, Tele – die ersten Reihen des Publikums stehen unten im Bild
  totale: { pos: [0, 2.2, 10.2], target: [0, 0.62, 0], fov: 24 },
  halbnah: { pos: [0, 1.45, 5.3], target: [0, 0.95, 0], fov: FOV },
  untersicht: { pos: [0, 0.55, 5.4], target: [0, 1.0, 0], fov: FOV },
  seite: { pos: [2.6, 1.3, 5.6], target: [0, 0.6, 0], fov: FOV },
  vogel: { pos: [0, 7.6, 3.4], target: [0, 0.3, -0.3], fov: FOV },
};
const ZOOM_END: Cam = { pos: [0, 1.35, 3.9], target: [0, 1.0, 0], fov: FOV };
/** Kamerakran: von schräg über den Köpfen links hinten hoch auf die rechte Seite über der Bühne */
const CRANE_START: Cam = { pos: [-4.2, 1.1, 9.4], target: [0, 1.1, 0], fov: 32 };
const CRANE_END: Cam = { pos: [3.2, 5.2, 5.6], target: [0, 0.6, -0.2], fov: FOV };
/** Outro: der Kran zieht sich nach hinten oben zurück – Abschied von der Bühne */
const CRANE_OUT_START: Cam = { pos: [0, 1.5, 5.2], target: [0, 1.0, 0], fov: FOV };
const CRANE_OUT_END: Cam = { pos: [0, 5.8, 13], target: [0, 0.8, 0], fov: 30 };

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
    case "kran": {
      const w = easeInOut(phraseProgress(p, t));
      const [from, to] = p.section === "outro" ? [CRANE_OUT_START, CRANE_OUT_END] : [CRANE_START, CRANE_END];
      // im Bogen: der Ausleger schwenkt seitlich und steigt dabei
      const arc = Math.sin(Math.PI * w) * 0.8;
      const pos = mix3(from.pos, to.pos, w);
      return {
        pos: [pos[0], pos[1] + arc, pos[2]],
        target: mix3(from.target, to.target, w),
        fov: from.fov + (to.fov - from.fov) * w,
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
  const now = shotAt(c, t);
  // hohe Energie: harter Schnitt (wie ein Konzertmitschnitt), sonst weiche Fahrt in die neue Einstellung
  const hard = p.energy >= 2;
  const bars = cutBarsFor(p);
  const cutStart = Math.max(p.startMs, p.startMs + Math.floor((t - p.startMs) / (bars * c.barMs)) * bars * c.barMs);
  const before = prev ? prev.camera : p.camera;
  const a = hard ? presetAt(now, p, t, focus) : presetAt(before, prev ?? p, t, focus);
  const b = presetAt(now, p, t, focus);
  const w = hard ? 1 : easeInOut((t - Math.max(p.startMs, cutStart)) / Math.min(c.barMs * 1.5, 3000));
  const sway = Math.sin(t / 4000) * (now === "nah" ? 0.08 : 0.25);
  const pos = mix3(a.pos, b.pos, w);
  // Handkamera: leichtes Wackeln bei hoher Energie (deterministisch aus der Songzeit)
  const shake = p.energy >= 2 && now !== "vogel" ? 0.012 * (p.energy - 1) : 0;
  const n = (k: number) => Math.sin(t / 211 + k) * 0.6 + Math.sin(t / 97 + 2 * k) * 0.4;
  const cam: Cam = {
    pos: [pos[0] + sway + shake * n(1), pos[1] + shake * n(2), pos[2]],
    target: ((tg) => [tg[0] + shake * n(3) * 0.6, tg[1] + shake * n(4) * 0.6, tg[2]] as const)(mix3(a.target, b.target, w)),
    fov: a.fov + (b.fov - a.fov) * w,
  };
  return openingFlight(c, t, finaleFlight(c, t, cam));
}

/** Eröffnung: so viele Takte (höchstens 8 s) fliegt die Kamera zum Songstart über das Publikum auf die Bühne */
export const OPENING_BARS = 3;
/** Startpunkt der Drohne: hoch und seitlich hinter dem Publikum */
const OPENING_START: Cam = { pos: [-5.5, 7.5, 21], target: [0, 1.4, 0], fov: 34 };

/** Songstart wie im Konzertfilm: Drohnenflug im Bogen über die Menge, während die Band die Bühne betritt. */
function openingFlight(c: Choreography, t: number, cam: Cam): Cam {
  const len = Math.min(OPENING_BARS * c.barMs, 8000);
  if (t < 0 || t >= len) return cam;
  const u = t / len;
  const w = easeInOut(u);
  // Bogen: seitlich hereinschwenken, nicht geradeaus
  const arc = Math.sin(Math.PI * u) * 2.5;
  const pos = mix3(OPENING_START.pos, cam.pos, w);
  return {
    pos: [pos[0] + arc * (1 - w), pos[1], pos[2]],
    target: mix3(OPENING_START.target, cam.target, w),
    fov: OPENING_START.fov + (cam.fov - OPENING_START.fov) * w,
  };
}

/** Schnitt-Raster: so viele Takte zwischen zwei Einstellungen einer Phrase */
export const CUT_BARS = 4;
/** Im wilden Refrain wird schneller geschnitten – alle zwei Takte, auf der Eins */
export const CUT_BARS_FAST = 2;
export const cutBarsFor = (p: Pick<Phrase, "section" | "energy">) =>
  p.section === "chorus" && p.energy >= 3 ? CUT_BARS_FAST : CUT_BARS;

/** Einstellung zur Zeit t: mit zweiter Einstellung (`cut`) im Schnitt-Raster abwechselnd (für Tests und Debug). */
export function shotAt(c: Choreography, t: number): CameraPreset {
  const p = c.phrases[phraseIndexAt(c, t)];
  if (!p) return "totale";
  // Mitsing-Moment: aus dem Publikum über die Köpfe – man sieht die Menge singen und den Sänger, der ihr das Mikro hinhält
  if (c.singAlong && t >= c.singAlong.startMs && t < c.singAlong.endMs) return "ueberkopf";
  // großer Einsatz (mit Countdown, nicht das Finale – das hat seinen Kameraflug): einen Takt lang nah auf den Sänger
  if (c.climaxes?.some((k) => k.countdown && !k.finale && t >= k.atMs && t < k.atMs + c.barMs)) return "nah";
  if (!p.cut) return p.camera;
  return Math.floor((t - p.startMs) / (cutBarsFor(p) * c.barMs)) % 2 === 1 ? p.cut : p.camera;
}

/** Start des Kameraflugs im Finale: hoch hinter dem Publikum, Blick über die Köpfe auf die Bühne */
const FLIGHT_START: Cam = { pos: [0, 4.6, 16], target: [0, 1.2, 0], fov: 30 };

/** Finale: über die Zeitlupe fliegt die Kamera von hinter dem Publikum auf ihre Einstellung zu. */
function finaleFlight(c: Choreography, t: number, cam: Cam): Cam {
  const f = c.climaxes?.find((x) => x.finale);
  if (!f) return cam;
  const u = (t - f.atMs) / (SLOWMO_BARS * c.barMs);
  if (u < 0 || u >= 1) return cam;
  const w = easeInOut(u);
  return {
    pos: mix3(FLIGHT_START.pos, cam.pos, w),
    target: mix3(FLIGHT_START.target, cam.target, w),
    fov: FLIGHT_START.fov + (cam.fov - FLIGHT_START.fov) * w,
  };
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

/** Bildformat, für das die Kameraeinstellungen gebaut sind (z. B. 1280×800) */
export const REF_ASPECT = 1.6;

/**
 * Kamera an schmale Bildschirme anpassen (Handy hochkant): Bei gleicher Einstellung sähe man dort nur noch den Lead
 * bzw. in der Nahaufnahme nur sein Gesicht. Die Kamera rückt zurück und öffnet etwas, bis dieselbe Bühnenbreite
 * zu sehen ist wie im Querformat – zu ~70 % über Abstand, zu ~30 % über den Bildwinkel (weniger Verzerrung).
 * Liefert dazu den Faktor, um den sich der Abstand vergrößert (für Nebel). Breitere Formate bleiben unverändert.
 */
export function fitAspect(cam: Cam, aspect: number): { cam: Cam; distance: number } {
  const s = REF_ASPECT / Math.max(aspect, 0.2);
  if (s <= 1) return { cam, distance: 1 };
  const distance = Math.pow(s, 0.7);
  const tanK = s / distance; // Abstand × Bildwinkel ergibt zusammen genau s
  const [tx, ty, tz] = cam.target;
  const pos: [number, number, number] = [
    tx + (cam.pos[0] - tx) * distance,
    ty + (cam.pos[1] - ty) * distance,
    tz + (cam.pos[2] - tz) * distance,
  ];
  const fov = (2 * Math.atan(Math.tan((cam.fov * Math.PI) / 360) * tanK) * 180) / Math.PI;
  return { cam: { pos, target: cam.target, fov }, distance };
}
