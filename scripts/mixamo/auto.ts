import { Quaternion } from "three";
import type { Energy } from "../../lib/dance/clips";
import type { MixamoEntry } from "../../lib/dance/mixamo";
import type { Sampled } from "../../lib/dance/retarget";

/**
 * Tänze, die nicht im Katalog stehen, automatisch aufnehmen – z. B. weitere Varianten von „Hip Hop Dancing“,
 * die der Browser als „Hip Hop Dancing (1).fbx“, „(2)“ … speichert.
 * Stil (Genres, Ersatz-Clip) kommt aus Stichwörtern im Dateinamen, die Energie aus der Bewegung selbst.
 */

const STYLES: Array<[RegExp, string[], string]> = [
  [/break|uprock|flair|windmill|footwork|freeze|power ?move/i, ["hip hop", "breakbeat"], "Dance_PowerHit"],
  [/robot|tut|popping|locking|wave hip|animation/i, ["electro", "hip hop", "synth"], "Dance_Robot"],
  [/hip ?hop|rap|krump|twerk/i, ["hip hop", "rap", "r&b"], "Dance_HipHop"],
  [/samba|salsa|rumba|tango|bachata|merengue|cha ?cha|latin|cumbia|capoeira/i, ["latin"], "Dance_LatinSway"],
  [/swing|charleston|lindy|jazz|tap/i, ["swing", "jazz", "soul"], "Dance_JazzSwing"],
  [/shuffle|house|techno|rave|club|jumpstyle/i, ["techno", "house", "edm"], "Dance_Shuffle"],
  [/twist|rock|guitar|headbang|punk/i, ["rock", "oldies"], "Dance_RockDrive"],
  [/belly|arab|bollywood|indian/i, ["world", "oriental"], "Dance_LiquidWave"],
  [/ballet|waltz|ballroom|slow|contemporary/i, ["klassik", "ballad"], "Dance_Waltz"],
  [/thriller|disco|funk|moonwalk|soul train/i, ["disco", "funk", "pop"], "Dance_Disco"],
  [/gangnam|k-?pop|macarena|chicken|ymca|silly|party|happy|joy|cheer|jump/i, ["pop", "dance", "party"], "Dance_FestivalBounce"],
];

/** Basisname ohne Endung und ohne Browser-Nummer: „Hip Hop Dancing (2).fbx“ → „Hip Hop Dancing“ */
export function baseName(file: string): string {
  return file
    .replace(/\.fbx$/i, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
}

/** „Hip Hop Dancing (2).fbx“ → „Mixamo_HipHopDancing_2“ */
export function idFromFile(file: string): string {
  const n = file.match(/\((\d+)\)\s*\.fbx$/i)?.[1];
  const words = baseName(file)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1));
  return `Mixamo_${words.join("") || "Tanz"}${n ? `_${n}` : ""}`;
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
  return { id: idFromFile(file), source: file, search: name, energy: 1, ...styleFromName(name), auto: true };
}
