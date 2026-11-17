/**
 * Mixamo-FBX und Mesh2Motion-GLB → kompakte Tanz-Clips für die Avatare.
 *
 *   1. FBX von mixamo.com nach ./mixamo legen, GLB-Animationen von Mesh2Motion nach ./mesh2motion
 *      (`npm run mesh2motion` lädt die Tänze; beide Ordner nicht im Repo, siehe docs/MIXAMO.md).
 *   2. npm run mixamo            (alle gefundenen)   ·   npm run mixamo -- --only Mixamo_Samba
 *
 * Schreibt public/animations/<id>.json und ergänzt lib/dance/mixamo-clips.json (Datei, Tempo, Länge).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnimationClip, AnimationMixer, Group, Quaternion, Vector3, type Object3D } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { BVHLoader } from "three/examples/jsm/loaders/BVHLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { packClip, unpackClip, type PackedClip } from "../../lib/dance/clip-pack";
import type { MixamoEntry } from "../../lib/dance/mixamo";
import { estimateBpm, makeLoop, restFromGltf, retargetSamples, type RestBone } from "../../lib/dance/retarget";
import {
  autoEntry,
  DUPLICATE_DISTANCE,
  isBvh,
  isGlb,
  energyFromMotion,
  motionSignature,
  preservedId,
  signatureDistance,
  skipFields,
  styleFromName,
} from "./auto";
import { installImageStub } from "./no-dom";
import { format, resolveConfig } from "prettier";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "mixamo");
const M2M_DIR = join(ROOT, "mesh2motion");
const CMU_DIR = join(ROOT, "cmu");
const OUT_DIR = join(ROOT, "public/animations");
const CATALOG = join(ROOT, "lib/dance/mixamo-clips.json");
const FPS = 30;

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : undefined;
// Fehlerverlauf: DEBUG=1 als Umgebungsvariable oder als Argument (`npm run mixamo debug=1` / `-- --debug`)
const debug = !!process.env.DEBUG || process.argv.some((a) => /^(--)?debug(=1|=true)?$/i.test(a));

function readGltfJson(file: string) {
  const b = readFileSync(file);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8"));
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.(fbx|glb|bvh)$/, "")
    .replace(/[^a-z0-9]/g, "");

function findSource(entry: MixamoEntry, files: string[]): string | undefined {
  if (entry.preserved) return undefined; // gesicherter früherer Tanz – gehört zu keiner FBX mehr
  const wanted = [norm(entry.source), norm(entry.search), norm(entry.id.replace(/^(Mixamo|M2M|CMU)_/, ""))];
  return files.find((f) => wanted.includes(norm(f)));
}

async function main() {
  installImageStub();
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as { clips: MixamoEntry[] };
  // alle Avatare teilen dasselbe Skelett (geprüft im Test „gemeinsame Grundpose“); Quelldateien statt Build-Ausgabe
  const first = readdirSync(join(ROOT, "avatars")).find((f) => f.endsWith(".glb"))!;
  const rest = restFromGltf(readGltfJson(join(ROOT, "avatars", first)));
  const list = (dir: string, ext: string) =>
    existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith(ext)) : [];
  const files = [...list(SRC_DIR, ".fbx"), ...list(M2M_DIR, ".glb"), ...list(CMU_DIR, ".bvh")];
  if (!files.length) {
    console.log(`Keine Quelldateien in ${SRC_DIR}, ${M2M_DIR} oder ${CMU_DIR}. Anleitung: docs/MIXAMO.md`);
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const failed: string[] = [];
  const signatures = new Map<string, number[]>();

  // FBX ohne Katalogeintrag (z. B. „Hip Hop Dancing (2).fbx“) automatisch aufnehmen
  const known = new Set(catalog.clips.map((e) => findSource(e, files)).filter((f): f is string => !!f));
  const ids = new Set(catalog.clips.map((e) => e.id));
  for (const file of files.filter((f) => !known.has(f))) {
    const entry = autoEntry(file);
    while (ids.has(entry.id)) entry.id += "_neu";
    ids.add(entry.id);
    catalog.clips.push(entry);
  }

  // über eine Kopie: entfernte Sicherungen (siehe unten) verschieben sonst die Schleife
  for (const entry of [...catalog.clips]) {
    if (!catalog.clips.includes(entry)) continue;
    if (only && entry.id !== only) continue;
    if (entry.preserved) continue;
    const file = findSource(entry, files);
    if (!file) {
      console.log(`– ${entry.id}: „${entry.source}“ nicht gefunden`);
      continue;
    }
    try {
      // bisherigen Clip merken: enthält die FBX inzwischen einen anderen Tanz (z. B. neu nummerierte Downloads),
      // bleibt der alte Tanz als eigener Eintrag erhalten statt überschrieben zu werden
      const before = storedClip(entry);
      const { line, signature } = await convertOne(entry, file, rest);
      signatures.set(entry.id, signature);
      if (before && signatureDistance(before.signature, signature) >= DUPLICATE_DISTANCE) {
        const kept = preserve(entry, before, ids);
        catalog.clips.push(kept);
        signatures.set(kept.id, before.signature);
        console.log(`↺ ${entry.id}: ${file} enthält jetzt einen anderen Tanz – der bisherige bleibt als ${kept.id}`);
      }
      // derselbe Tanz schon unter anderem Namen/Nummer da? Dann bleibt der zuerst eingetragene.
      const twin = findTwin(entry, catalog.clips, signatures);
      if (twin) {
        const [keep, drop] = catalog.clips.indexOf(twin) < catalog.clips.indexOf(entry) ? [twin, entry] : [entry, twin];
        if (drop.preserved) {
          // gesicherter früherer Tanz ist doch derselbe wie ein aktueller: Sicherung samt Datei ganz entfernen
          // (eine Sicherung ohne Datei wäre nutzlos – sie hängt an keiner FBX mehr)
          rmSync(join(OUT_DIR, `${drop.id}.json`), { force: true });
          catalog.clips.splice(catalog.clips.indexOf(drop), 1);
          signatures.delete(drop.id);
          console.log(`= ${drop.id}: gesicherter Tanz ist derselbe wie ${keep.id} – Sicherung entfernt`);
        } else {
          markDuplicate(drop, keep);
          console.log(`= ${drop.id}: ${drop.source} ist derselbe Tanz wie ${keep.id} (${keep.source}) – übersprungen`);
        }
        if (drop === entry) continue;
      }
      delete entry.duplicateOf;
      if (entry.auto) {
        // Stil und Überspringen bei jeder Umwandlung neu aus dem Namen (verbesserte Regeln greifen auch für alte Einträge)
        delete entry.skip;
        delete entry.skipReason;
        Object.assign(entry, styleFromName(entry.search), skipFields(entry.search));
      }
      const neu = entry.auto
        ? ` · auto: Energie ${entry.energy}, Stil ${entry.genres[0]}, Ersatz ${entry.fallback}${entry.skip ? ` · übersprungen (${entry.skipReason})` : ""}`
        : "";
      console.log(`✓ ${entry.id}: ${file} · ${line}${neu}`);
    } catch (e) {
      // Datei nennen und mit der nächsten weitermachen, statt alles abzubrechen
      failed.push(file);
      console.log(`✗ ${entry.id}: ${file} – ${e instanceof Error ? e.message : String(e)}`);
      if (debug && e instanceof Error) console.log(e.stack);
    }
  }
  // wie im Repo formatiert (sonst schlägt `prettier --check` in der CI an)
  writeFileSync(CATALOG, await format(JSON.stringify(catalog), { ...(await resolveConfig(CATALOG)), filepath: CATALOG }));
  if (failed.length) {
    console.log(`\n${failed.length} Datei(en) nicht umgewandelt: ${failed.join(", ")} (Details mit: npm run mixamo debug=1)`);
    process.exitCode = 1;
  }
}

/**
 * Länge der Schleife in Schlägen (ganze Takte) und Überblendung in Frames.
 * Bevorzugt eine halbe Schlaglänge Überblendung; reicht die Aufnahme dafür nicht, wird sie bis auf 2 Frames gekürzt.
 */
export function loopLength(availableFrames: number, beatFrames: number): { beats: number; blend: number } {
  const ideal = Math.max(2, Math.round(beatFrames / 2));
  const beats = Math.floor((availableFrames - ideal) / beatFrames / 4) * 4;
  if (beats >= 4) return { beats, blend: ideal };
  const bar = Math.round(4 * beatFrames);
  const blend = Math.min(ideal, Math.floor(availableFrames - bar));
  return blend >= 2 ? { beats: 4, blend } : { beats: 0, blend: ideal };
}

/** Bisheriger Clip eines Eintrags (Inhalt + Fingerabdruck), falls vorhanden */
function storedClip(entry: MixamoEntry): { packed: PackedClip; signature: number[] } | undefined {
  const path = join(OUT_DIR, `${entry.id}.json`);
  if (!entry.file || !existsSync(path)) return undefined;
  const packed = JSON.parse(readFileSync(path, "utf8")) as PackedClip;
  return { packed, signature: storedSignature(entry)! };
}

/** Früheren Tanz unter neuer ID sichern (Datei + Katalogeintrag ohne FBX-Zuordnung). */
function preserve(entry: MixamoEntry, before: { packed: PackedClip }, ids: Set<string>): MixamoEntry {
  const id = preservedId(entry.id, ids);
  ids.add(id);
  const json = JSON.stringify({ ...before.packed, name: id });
  const sha = createHash("sha256").update(json).digest("hex").slice(0, 12);
  writeFileSync(join(OUT_DIR, `${id}.json`), json);
  const kept: MixamoEntry = { ...entry, id, file: `/animations/${id}.json?v=${sha}`, preserved: true };
  delete kept.auto;
  delete kept.duplicateOf;
  return kept;
}

/** Fingerabdruck eines bereits umgewandelten Tanzes aus seiner Clip-Datei (für Tänze, die in diesem Lauf nicht neu umgewandelt werden). */
function storedSignature(entry: MixamoEntry): number[] | undefined {
  const path = join(OUT_DIR, `${entry.id}.json`);
  if (!entry.file || !existsSync(path)) return undefined;
  const clip = unpackClip(JSON.parse(readFileSync(path, "utf8")) as PackedClip);
  const rotations = new Map(
    clip.tracks.filter((t) => t.name.endsWith(".quaternion")).map((t) => [t.name.split(".")[0]!, t.values] as const),
  );
  const frames = (clip.tracks[0]?.times.length ?? 1) - 1; // ohne den angehängten Schlussframe
  return motionSignature(rotations, frames);
}

/** Anderer umgewandelter Tanz mit (fast) identischer Bewegung */
function findTwin(entry: MixamoEntry, all: MixamoEntry[], signatures: Map<string, number[]>): MixamoEntry | undefined {
  const mine = signatures.get(entry.id)!;
  for (const other of all) {
    if (other === entry || other.duplicateOf || !other.file) continue;
    if (!signatures.has(other.id)) {
      const sig = storedSignature(other);
      if (!sig) continue;
      signatures.set(other.id, sig);
    }
    if (signatureDistance(mine, signatures.get(other.id)!) < DUPLICATE_DISTANCE) return other;
  }
  return undefined;
}

function markDuplicate(drop: MixamoEntry, keep: MixamoEntry) {
  rmSync(join(OUT_DIR, `${drop.id}.json`), { force: true });
  delete drop.file;
  delete drop.beats;
  delete drop.detectedBpm;
  drop.duplicateOf = keep.id;
  drop.skip = true;
}

/**
 * Tempo für eine kurze, nahtlose Schleife: ein Durchlauf = ganze Schläge (nahe am geschätzten Tempo), und so viele
 * Durchläufe, dass die Schleife ganze Takte (Vielfaches von 4 Schlägen) lang ist.
 */
export function cycleTempo(durationSec: number, bpm: number): { bpm: number; beatsPerCycle: number; repeats: number } {
  const beatsPerCycle = Math.max(1, Math.round((durationSec * bpm) / 60));
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  return {
    bpm: Math.round(((beatsPerCycle * 60) / durationSec) * 10) / 10,
    beatsPerCycle,
    repeats: 4 / gcd(beatsPerCycle, 4),
  };
}

/** Clip n-mal hintereinander (Schlüssel bei t = 0 der Folgedurchläufe entfallen – sie gleichen dem Ende davor). */
export function repeatClip(clip: AnimationClip, n: number): AnimationClip {
  const d = clip.duration;
  const tracks = clip.tracks.map((t) => {
    const size = t.getValueSize();
    const times: number[] = [];
    const values: number[] = [];
    for (let k = 0; k < n; k++)
      t.times.forEach((time, i) => {
        if (k > 0 && time <= 1e-6) return;
        times.push(time + k * d);
        for (let c = 0; c < size; c++) values.push(t.values[i * size + c]!);
      });
    const Track = t.constructor as new (name: string, times: number[], values: number[]) => typeof t;
    return new Track(t.name, times, values);
  });
  return new AnimationClip(`${clip.name}×${n}`, d * n, tracks);
}

/**
 * CMU-Rücken heißt anders als bei Mixamo: LowerBack › Spine › Spine1 (Brust) statt Spine › Spine1 › Spine2.
 * Alle übrigen Knochen (Hips, LeftArm, RightUpLeg …) tragen schon Mixamo-Namen.
 */
export const CMU_BONES: Record<string, string> = { LowerBack: "Spine", Spine: "Spine1", Spine1: "Spine2" };

/** BVH (CMU) laden und die Rückenknochen umbenennen – samt der Spuren, die sie animieren. */
export function loadBvh(text: string): { group: Object3D; animations: AnimationClip[] } {
  const { skeleton, clip } = new BVHLoader().parse(text);
  const rename = (n: string) => CMU_BONES[n] ?? n;
  for (const b of skeleton.bones) b.name = rename(b.name);
  for (const t of clip.tracks) {
    const dot = t.name.lastIndexOf(".");
    t.name = rename(t.name.slice(0, dot)) + t.name.slice(dot);
  }
  // BVH-Grundpose hat die Hüfte im Ursprung, die Aufnahme trägt die echte Hüfthöhe (Position-Kanal).
  // Ruhehöhe = mittlere Hüfthöhe der Aufnahme – sonst deutet das Retargeting den ganzen Abstand als Sprung.
  const root = skeleton.bones[0]!;
  const pos = clip.tracks.find((t) => t.name === `${root.name}.position`);
  if (pos) {
    const ys = Array.from({ length: pos.values.length / 3 }, (_, i) => pos.values[i * 3 + 1]!).sort((x, y) => x - y);
    root.position.set(pos.values[0]!, ys[Math.floor(ys.length / 2)]!, pos.values[2]!);
  }
  const group = new Group();
  group.add(root);
  group.updateMatrixWorld(true);
  return { group, animations: [clip] };
}

/** Blickrichtung (horizontal) aus der Hüftbreite: senkrecht zu „links − rechts“. */
function facing(byName: Map<string, Object3D>): Vector3 {
  const l = byName.get("LeftUpLeg")!.getWorldPosition(new Vector3());
  const r = byName.get("RightUpLeg")!.getWorldPosition(new Vector3());
  const side = l.sub(r).setY(0).normalize();
  return new Vector3(0, 1, 0).cross(side);
}

/**
 * Motion-Capture-Tänzer stehen im Aufnahmeraum irgendwie (CMU: oft seitlich oder mit dem Rücken zur Kamera).
 * Dreht die ganze Bewegung um die Hochachse, sodass der Tänzer im Mittel des Ausschnitts so schaut wie in der
 * Grundpose – also wie die Avatare nach vorn. Drehungen innerhalb des Tanzes bleiben erhalten.
 */
export function faceForward(group: Object3D, clip: AnimationClip, from = 0, to = clip.duration): number {
  const byName = new Map<string, Object3D>();
  group.traverse((o) => byName.set(o.name, o));
  const hips = byName.get("Hips");
  if (!hips || !byName.has("LeftUpLeg") || !byName.has("RightUpLeg")) return 0;
  const saved = [...byName.values()].map((o) => [o, o.position.clone(), o.quaternion.clone()] as const);
  group.updateMatrixWorld(true);
  const rest = facing(byName);
  const mixer = new AnimationMixer(group);
  mixer.clipAction(clip).play();
  const sum = new Vector3();
  for (let i = 0; i < 48; i++) {
    mixer.setTime(from + ((to - from) * i) / 48);
    group.updateMatrixWorld(true);
    sum.add(facing(byName));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(group);
  // Grundpose wiederherstellen (der Mixer hat die Knochen bewegt; das Retargeting liest sie als Ruhepose)
  for (const [o, p, r] of saved) {
    o.position.copy(p);
    o.quaternion.copy(r);
  }
  group.updateMatrixWorld(true);
  const mean = Math.atan2(sum.x, sum.z);
  // auf (−180°, 180°] bringen: kürzeste Drehung
  const yaw = Math.atan2(Math.sin(Math.atan2(rest.x, rest.z) - mean), Math.cos(Math.atan2(rest.x, rest.z) - mean));
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
  const v = new Vector3();
  const k = new Quaternion();
  for (const t of clip.tracks) {
    if (t.name === `${hips.name}.quaternion`)
      for (let i = 0; i < t.values.length; i += 4) {
        // Hüfte hängt in der Gruppe ohne eigene Drehung: Weltdrehung = q · lokale Drehung
        k.fromArray(t.values, i).premultiply(q).toArray(t.values, i);
      }
    if (t.name === `${hips.name}.position`)
      for (let i = 0; i < t.values.length; i += 3) v.fromArray(t.values, i).applyQuaternion(q).toArray(t.values, i);
  }
  return (yaw * 180) / Math.PI;
}

/** Skelett und Animationen einer Quelldatei: Mixamo-FBX oder Mesh2Motion-GLB. */
async function loadSource(file: string): Promise<{ group: Object3D; animations: AnimationClip[] }> {
  if (isBvh(file)) return loadBvh(readFileSync(join(CMU_DIR, file), "utf8"));
  const buf = readFileSync(join(isGlb(file) ? M2M_DIR : SRC_DIR, file));
  const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  if (!isGlb(file)) {
    const group = new FBXLoader().parse(data, "");
    return { group, animations: group.animations };
  }
  // Mesh2Motion speichert Animationen meshopt-komprimiert
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(data, "");
  return { group: gltf.scene, animations: gltf.animations };
}

/** Eine Quelldatei umwandeln; liefert die Erfolgszeile oder wirft mit verständlicher Meldung. */
async function convertOne(entry: MixamoEntry, file: string, rest: RestBone[]): Promise<{ line: string; signature: number[] }> {
  const { group, animations } = await loadSource(file);
  const clip = [...animations].sort((a, b) => b.duration - a.duration)[0] as AnimationClip | undefined;
  if (!clip || clip.duration < 1) {
    throw new Error("keine Animation in der Datei");
  }
  const start = entry.start ?? 0;
  const end = Math.min(entry.end ?? clip.duration, clip.duration);
  // Motion-Capture (CMU): Tänzer zur Kamera drehen
  if (isBvh(file)) faceForward(group, clip, start, end);

  // kurze Schleife (unter 4 s, ganz verwendet): zum Schätzen mehrfach hintereinander
  const short = clip.duration < 4 && start === 0 && end === clip.duration;
  const probeClip = short ? repeatClip(clip, Math.ceil(8 / clip.duration)) : clip;

  // 1. Tempo: aus dem Wippen der Hüfte schätzen (oder Katalogwert)
  const probe = retargetSamples({
    source: group,
    clip: probeClip,
    target: rest,
    fps: FPS,
    from: start,
    to: short ? probeClip.duration : end,
  });
  const ys = Array.from({ length: probe.frames }, (_, f) => probe.hips[f * 3 + 1]!);
  const detected = estimateBpm(ys, FPS);
  let bpm = entry.bpm ?? detected ?? 120;

  // Kurze, nahtlose Schleifen (Mesh2Motion: 1–2 s) wiederholen; Tempo so, dass ein Durchlauf ganze Schläge dauert
  let source = clip;
  if (short && loopLength((end - start) * FPS, (60 / bpm) * FPS).beats < 4) {
    const cycle = cycleTempo(clip.duration, bpm);
    if (!entry.bpm) bpm = cycle.bpm;
    source = repeatClip(clip, cycle.repeats + 1);
  }
  const beatSec = 60 / bpm;
  const span = source === clip ? end - start : source.duration;

  // 2. ganze Takte als Schleife, bis zu eine halbe Schlaglänge Überblendung
  //    (bei sehr kurzen Aufnahmen kürzer, damit wenigstens ein Takt hineinpasst)
  const { beats, blend } = loopLength(span * FPS, beatSec * FPS);
  if (beats < 4) {
    throw new Error(`zu kurz für einen Takt (${(end - start).toFixed(1)} s bei ${bpm} BPM)`);
  }
  const loopFrames = Math.round(beats * beatSec * FPS);
  const sampled = retargetSamples({
    source: group,
    clip: source,
    target: rest,
    fps: FPS,
    from: start,
    to: start + (loopFrames + blend - 1) / FPS,
  });
  const loop = makeLoop(sampled, blend);

  // 3. auf 120 BPM normieren (1 Schlag = 0,5 s), packen, schreiben
  const normalized = { ...loop, fps: (FPS * bpm) / 120 };
  // automatisch aufgenommene Tänze: Energie aus der Bewegung (bis `auto` im Katalog entfernt wird)
  if (entry.auto) entry.energy = energyFromMotion(normalized);
  const packed = packClip(entry.id, normalized);
  const json = JSON.stringify(packed);
  const sha = createHash("sha256").update(json).digest("hex").slice(0, 12);
  writeFileSync(join(OUT_DIR, `${entry.id}.json`), json);
  Object.assign(entry, { file: `/animations/${entry.id}.json?v=${sha}`, beats, detectedBpm: detected ?? undefined });
  const tempo = entry.bpm ? "" : detected ? " (geschätzt)" : " (Standard – bitte im Katalog angeben)";
  return {
    line: `${bpm} BPM${tempo} · ${beats} Schläge · ${(json.length / 1024).toFixed(0)} KB`,
    signature: motionSignature(loop.rotations, loop.frames),
  };
}

// nur als Skript ausführen, nicht beim Import (Tests)
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/mixamo/convert.ts")) void main();
