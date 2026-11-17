import { Quaternion } from "three";
import type { Energy } from "../../lib/dance/clips";
import { isTransition, type MixamoEntry } from "../../lib/dance/mixamo";
import type { Sampled } from "../../lib/dance/retarget";

/**
 * Tänze, die nicht im Katalog stehen, automatisch aufnehmen – z. B. weitere Varianten von „Hip Hop Dancing“,
 * die der Browser als „Hip Hop Dancing (1).fbx“, „(2)“ … speichert.
 * Stil (Genres, Ersatz-Clip) kommt aus Stichwörtern im Dateinamen, die Energie aus der Bewegung selbst.
 */

const STYLES: Array<[RegExp, string[], string]> = [
  // Bühnengesten
  [/guitar|drum|headbang/i, ["rock", "metal", "punk"], "Dance_RockDrive"],
  [
    /cheer|clap|victory|excited|thankful|greeting|waving|singing|celebrat|hokey|shopping cart/i,
    ["pop", "dance", "party"],
    "Dance_FestivalBounce",
  ],
  // Capoeira-Bewegungen und Northern Soul
  [/capoeira|macaco|rasteira|meia lua|ginga|\bau to\b/i, ["latin", "world", "brazil"], "Dance_LatinSway"],
  [/northern soul/i, ["soul", "funk", "disco"], "Dance_Disco"],
  [/break|uprock|flair|windmill|footwork|freeze|power ?move/i, ["hip hop", "breakbeat"], "Dance_PowerHit"],
  [/robot|tut|popping|locking|wave hip|animation/i, ["electro", "hip hop", "synth"], "Dance_Robot"],
  [/hip ?hop|rap|krump|twerk/i, ["hip hop", "rap", "r&b"], "Dance_HipHop"],
  [/samba|salsa|rumba|tango|bachata|merengue|cha ?cha|latin|cumbia|capoeira|lambada/i, ["latin"], "Dance_LatinSway"],
  [/swing|charleston|lindy|jazz|tap/i, ["swing", "jazz", "soul"], "Dance_JazzSwing"],
  [/shuffle|house|techno|rave|club|jumpstyle/i, ["techno", "house", "edm"], "Dance_Shuffle"],
  [/twist|rock|guitar|headbang|punk/i, ["rock", "oldies"], "Dance_RockDrive"],
  [/belly|arab|bollywood|indian/i, ["world", "oriental"], "Dance_LiquidWave"],
  [/ballet|waltz|ballroom|slow|contemporary/i, ["klassik", "ballad"], "Dance_Waltz"],
  [/thriller|disco|funk|moonwalk|soul train/i, ["disco", "funk", "pop"], "Dance_Disco"],
  [/gangnam|k-?pop|macarena|chicken|ymca|silly|party|happy|joy|cheer|jump/i, ["pop", "dance", "party"], "Dance_FestivalBounce"],
];

/** Mixamo hat neben Tänzen auch Kampf, Waffen, Gehen, Alltag – auf der Bühne fehl am Platz */
const NON_DANCE =
  /rifle|reload|gun|pistol|sword|fight|punch|kick|takedown|disarm|shov|block|uppercut|hit (on|to)|stab|zombie|walk|jog|running|rummag|texting|phone|talking|look|nervous|petting|kiss|stretch|surprised|laugh|thoughtful|wobbl|floating|opening|^entry$|^standing$|jumping down|sitting|crouch|dying|death|injur|sleep|drink|eat|crawl|dodg|headbutt|^header$|kettlebell|sweep|pointing|dismiss|\bturn\b|cover|react|strafe|to land|change direction|\brun\b|\bpose\b|skinning/i;

/** Warum ein Clip nicht eingeplant wird (Übergang, kein Tanz) – oder undefined */
export function skipReason(name: string): "Übergang" | "kein Tanz" | undefined {
  if (isTransition(name)) return "Übergang";
  // „Dancing Running Man“ ist ein Tanz, „Running“ nicht – und der Moonwalk ist trotz „walk“ einer
  if (!/danc|moonwalk/i.test(name) && NON_DANCE.test(name)) return "kein Tanz";
  return undefined;
}

/** Mesh2Motion-Animation (GLB) statt Mixamo-FBX? */
export const isGlb = (file: string) => /\.glb$/i.test(file);
/** CMU-Motion-Capture (BVH), Dateiname „salsa_60_01.bvh“ = Beschreibung + Aufnahme */
export const isBvh = (file: string) => /\.bvh$/i.test(file);
const cmuTake = (file: string) => file.match(/(\d+_\d+)\.bvh$/i)?.[1];

/**
 * Basisname ohne Endung und ohne Browser-Nummer: „Hip Hop Dancing (2).fbx“ → „Hip Hop Dancing“,
 * Mesh2Motion „dance-body-roll.glb“ → „Dance Body Roll“
 */
export function baseName(file: string): string {
  const name = file
    .replace(/\.(fbx|glb|bvh)$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
  if (!isGlb(file) && !isBvh(file)) return name;
  return name
    .split(/[-_\s]+/)
    .filter((w) => w && !(isBvh(file) && /^\d+$/.test(w)))
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * „Hip Hop Dancing (2).fbx“ → „Mixamo_HipHopDancing_2“, „dance-simple.glb“ → „M2M_DanceSimple“,
 * „salsa_60_01.bvh“ → „CMU_Salsa_60_01“
 */
export function idFromFile(file: string): string {
  const n = isBvh(file) ? cmuTake(file) : file.match(/\((\d+)\)\s*\.(fbx|glb)$/i)?.[1];
  const words = baseName(file)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1));
  const prefix = isGlb(file) ? "M2M" : isBvh(file) ? "CMU" : "Mixamo";
  return `${prefix}_${words.join("") || "Tanz"}${n ? `_${n}` : ""}`;
}

export function styleFromName(name: string): { genres: string[]; fallback: string } {
  for (const [re, genres, fallback] of STYLES) if (re.test(name)) return { genres, fallback };
  return { genres: ["pop", "dance"], fallback: "Dance_Groove" };
}

/**
 * Energie aus der Bewegung (auf 120 BPM normiert): mittlere Drehgeschwindigkeit von Rumpf, Armen und Beinen
 * plus Hüftwippen. Schwellen an den ersten 15 umgewandelten Tänzen abgestimmt
 * (Bauchtanz/Salsa ≈ 1,4–1,7 · Hip Hop/Thriller ≈ 2,2–3,3 · Breakdance/Jump/Gangnam ≈ 4,6–5,2).
 */
export function energyFromMotion(s: Pick<Sampled, "fps" | "frames" | "rotations" | "hips">): Energy {
  const bones = [
    "Hips",
    "Spine",
    "Chest",
    "LeftArm",
    "RightArm",
    "LeftForeArm",
    "RightForeArm",
    "LeftUpLeg",
    "RightUpLeg",
    "LeftLeg",
    "RightLeg",
  ];
  const a = new Quaternion();
  const b = new Quaternion();
  let turn = 0;
  let n = 0;
  for (const name of bones) {
    const r = s.rotations.get(name);
    if (!r) continue;
    for (let f = 1; f < s.frames; f++) {
      a.fromArray(r, (f - 1) * 4);
      b.fromArray(r, f * 4);
      turn += a.angleTo(b) * s.fps;
      n++;
    }
  }
  let bob = 0;
  for (let f = 1; f < s.frames; f++) bob += Math.abs(s.hips[f * 3 + 1]! - s.hips[(f - 1) * 3 + 1]!) * s.fps;
  const score = (n ? turn / n : 0) + 3 * (s.frames > 1 ? bob / (s.frames - 1) : 0);
  return score < 1.2 ? 0 : score < 2 ? 1 : score < 3.5 ? 2 : 3;
}

/** Katalogeintrag für eine FBX ohne Eintrag; Energie wird nach der Umwandlung gemessen. */
export function autoEntry(file: string): MixamoEntry {
  const name = baseName(file);
  return {
    id: idFromFile(file),
    source: file,
    search: name,
    energy: 1,
    ...styleFromName(name),
    auto: true,
    // Motion-Capture: erstes Bild ist die Kalibrierpose, Aufnahmen bis 60 s – ein 16-s-Ausschnitt reicht als Schleife
    ...(isBvh(file) ? { start: 0.1, end: 16.1 } : {}),
    ...skipFields(name),
  };
}

/** skip/skipReason passend zum Namen (für automatische Einträge bei jeder Umwandlung neu) */
export function skipFields(name: string): { skip?: true; skipReason?: string } {
  const reason = skipReason(name);
  return reason ? { skip: true, skipReason: reason } : {};
}

/** Neue ID für einen gesicherten früheren Tanz: „Mixamo_HipHopDancing_4“ → „…_4_alt“, „…_4_alt2“ … */
export function preservedId(id: string, taken: Set<string>): string {
  let n = 1;
  let out = `${id}_alt`;
  while (taken.has(out)) out = `${id}_alt${++n}`;
  return out;
}

/**
 * Bewegungs-Fingerabdruck eines umgewandelten Tanzes: je Knochen und Quaternion-Komponente Mittelwert und
 * Streuung (Beträge, damit q/−q gleich zählen). Derselbe Tanz zweimal heruntergeladen → Abstand ≈ 0;
 * verschiedene Varianten (z. B. „Hip Hop Dancing (3)“ vs. „(4)“) liegen bei ≥ 0,02.
 */
export function motionSignature(rotations: Map<string, ArrayLike<number>>, frames: number): number[] {
  const out: number[] = [];
  for (const name of [...rotations.keys()].sort()) {
    const r = rotations.get(name)!;
    for (let k = 0; k < 4; k++) {
      let mean = 0;
      for (let f = 0; f < frames; f++) mean += Math.abs(r[f * 4 + k]!);
      mean /= frames;
      let v = 0;
      for (let f = 0; f < frames; f++) v += (Math.abs(r[f * 4 + k]!) - mean) ** 2;
      out.push(mean, Math.sqrt(v / frames));
    }
  }
  return out;
}

export const DUPLICATE_DISTANCE = 0.005;

export function signatureDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return Infinity;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i]! - b[i]!) ** 2;
  return Math.sqrt(s / a.length);
}
