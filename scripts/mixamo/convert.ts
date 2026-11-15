/**
 * Mixamo-FBX → kompakte Tanz-Clips für die Avatare.
 *
 *   1. FBX von mixamo.com laden (siehe docs/MIXAMO.md) und nach ./mixamo legen (nicht im Repo).
 *   2. npm run mixamo            (alle gefundenen)   ·   npm run mixamo -- --only Mixamo_Samba
 *
 * Schreibt public/animations/<id>.json und ergänzt lib/dance/mixamo-clips.json (Datei, Tempo, Länge).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AnimationClip } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { packClip } from "../../lib/dance/clip-pack";
import type { MixamoEntry } from "../../lib/dance/mixamo";
import { estimateBpm, makeLoop, restFromGltf, retargetSamples, type RestBone } from "../../lib/dance/retarget";
import { autoEntry, energyFromMotion } from "./auto";
import { installImageStub } from "./no-dom";
import { format, resolveConfig } from "prettier";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "mixamo");
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
    .replace(/\.fbx$/, "")
    .replace(/[^a-z0-9]/g, "");

function findSource(entry: MixamoEntry, files: string[]): string | undefined {
  const wanted = [norm(entry.source), norm(entry.search), norm(entry.id.replace(/^Mixamo_/, ""))];
  return files.find((f) => wanted.includes(norm(f)));
}

async function main() {
  installImageStub();
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as { clips: MixamoEntry[] };
  // alle Avatare teilen dasselbe Skelett (geprüft im Test „gemeinsame Grundpose“); Quelldateien statt Build-Ausgabe
  const first = readdirSync(join(ROOT, "avatars")).find((f) => f.endsWith(".glb"))!;
  const rest = restFromGltf(readGltfJson(join(ROOT, "avatars", first)));
  const files = existsSync(SRC_DIR) ? readdirSync(SRC_DIR).filter((f) => f.toLowerCase().endsWith(".fbx")) : [];
  if (!files.length) {
    console.log(`Keine FBX-Dateien in ${SRC_DIR}. Anleitung: docs/MIXAMO.md`);
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const failed: string[] = [];

  // FBX ohne Katalogeintrag (z. B. „Hip Hop Dancing (2).fbx“) automatisch aufnehmen
  const known = new Set(catalog.clips.map((e) => findSource(e, files)).filter((f): f is string => !!f));
  const ids = new Set(catalog.clips.map((e) => e.id));
  for (const file of files.filter((f) => !known.has(f))) {
    const entry = autoEntry(file);
    while (ids.has(entry.id)) entry.id += "_neu";
    ids.add(entry.id);
    catalog.clips.push(entry);
  }

  for (const entry of catalog.clips) {
    if (only && entry.id !== only) continue;
    const file = findSource(entry, files);
    if (!file) {
      console.log(`– ${entry.id}: „${entry.source}“ nicht gefunden`);
      continue;
    }
    try {
      const line = convertOne(entry, file, rest);
      const neu = entry.auto
        ? ` · auto: Energie ${entry.energy}, Stil ${entry.genres[0]}, Ersatz ${entry.fallback}${entry.skip ? " · übersprungen (Übergang)" : ""}`
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

/** Eine FBX-Datei umwandeln; liefert die Erfolgszeile oder wirft mit verständlicher Meldung. */
function convertOne(entry: MixamoEntry, file: string, rest: RestBone[]): string {
  const buf = readFileSync(join(SRC_DIR, file));
  const group = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
  const clip = [...group.animations].sort((a, b) => b.duration - a.duration)[0] as AnimationClip | undefined;
  if (!clip || clip.duration < 1) {
    throw new Error("keine Animation in der Datei");
  }
  const start = entry.start ?? 0;
  const end = Math.min(entry.end ?? clip.duration, clip.duration);

  // 1. Tempo: aus dem Wippen der Hüfte schätzen (oder Katalogwert)
  const probe = retargetSamples({ source: group, clip, target: rest, fps: FPS, from: start, to: end });
  const ys = Array.from({ length: probe.frames }, (_, f) => probe.hips[f * 3 + 1]!);
  const detected = estimateBpm(ys, FPS);
  const bpm = entry.bpm ?? detected ?? 120;
  const beatSec = 60 / bpm;

  // 2. ganze Takte als Schleife, bis zu eine halbe Schlaglänge Überblendung
  //    (bei sehr kurzen Aufnahmen kürzer, damit wenigstens ein Takt hineinpasst)
  const { beats, blend } = loopLength((end - start) * FPS, beatSec * FPS);
  if (beats < 4) {
    throw new Error(`zu kurz für einen Takt (${(end - start).toFixed(1)} s bei ${bpm} BPM)`);
  }
  const loopFrames = Math.round(beats * beatSec * FPS);
  const sampled = retargetSamples({
    source: group,
    clip,
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
  return `${bpm} BPM${tempo} · ${beats} Schläge · ${(json.length / 1024).toFixed(0)} KB`;
}

// nur als Skript ausführen, nicht beim Import (Tests)
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/mixamo/convert.ts")) void main();
