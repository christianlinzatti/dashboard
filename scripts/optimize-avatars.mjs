// Komprimiert die Avatare aus /avatars nach /public/avatars (Meshopt + Quantisierung)
// und erzeugt ein schlankes Manifest für die App. Läuft automatisch vor `next build`.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat, copyFile } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { cloneDocument, dedup, prune, quantize, resample, weld, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { comparePoses, dropStaticChannels, packRotations, sharedSignature, splitSharedClips } from "./avatar-anim.mjs";
import { OPTIMIZE_VERSION } from "./avatar-catalog.mjs";

/** Größte erlaubte Abweichung der Tanz-Posen durch die Optimierung (weit unter sichtbar) */
const MAX_DEVIATION = { rotationDeg: 0.1, translation: 1e-3, scale: 1e-3 };

const root = path.resolve(import.meta.dirname, "..");
const srcDir = path.join(root, "avatars");
const outDir = path.join(root, "public", "avatars");
const force = process.argv.includes("--force");

const manifest = JSON.parse(await readFile(path.join(srcDir, "manifest.json"), "utf8"));
await mkdir(outDir, { recursive: true });
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .setLogger({ debug() {}, info() {}, warn: console.warn, error: console.error })
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const out = [];
let total = 0;
/** gemeinsame Tanzdateien, die die Figuren dieses Builds brauchen */
const tanzFiles = new Set();
for (const entry of manifest) {
  // erzeugte Figuren (scripts/avatars/build-characters.mjs) liegen nicht im Repo, sondern unter avatars/generated
  const src = path.join(srcDir, entry.generated ? "generated" : "", entry.file);
  const dst = path.join(outDir, entry.file);
  const png = entry.file.replace(/\.glb$/, ".png");
  const buf = await readFile(src);
  const sha = createHash("sha256").update(buf).digest("hex");
  if (!entry.generated && sha !== entry.sha256) throw new Error(`Prüfsumme stimmt nicht: ${entry.file}`);

  // Nur neu komprimieren, wenn sich die Quelldatei geändert hat (oder das Verfahren: OPTIMIZE_VERSION) und die
  // gemeinsame Tanzdatei noch da ist. Die .sha-Datei merkt sich Stempel und Namen der Tanzdatei.
  const stamp = `${sha}:${OPTIMIZE_VERSION}`;
  const [savedStamp, savedTanz] = (await readFile(dst + ".sha", "utf8").catch(() => "")).split("\n");
  const fresh =
    !force && savedStamp === stamp && !!savedTanz && (await stat(path.join(outDir, savedTanz)).catch(() => null)) !== null;
  let note = "";
  let tanz = savedTanz;
  if (!fresh) {
    const doc = await io.readBinary(buf);
    await doc.transform(dedup(), prune(), weld(), resample());
    const before = cloneDocument(doc);
    // Tanz-Spuren verschlanken: stillstehende Spuren weg, Drehungen als Int16 (Bewegung bleibt gleich)
    const dropped = dropStaticChannels(doc);
    packRotations(doc);
    // Skelett-Tänze in eine gemeinsame Datei: Figuren mit gleichem Fingerabdruck tanzen exakt gleich und teilen sie
    tanz = `tanz-${sharedSignature(doc, createHash)}.glb`;
    // Tanzdatei ohne Modell: „nichts zu sortieren“-Hinweise von meshopt sind dort erwartbar
    const shared = cloneDocument(doc).setLogger({ debug() {}, info() {}, warn() {}, error: console.error });
    const moved = splitSharedClips(doc, shared);
    const scene = doc.getRoot().listScenes()[0];
    scene?.setExtras({ ...scene.getExtras(), tanz });
    await shared.transform(prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
    await doc.transform(prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
    const bin = await io.writeBinary(doc);
    const tanzBin = await io.writeBinary(shared);
    // Probe: jede Pose vor dem Verschlanken gegen das, was die Bühne abspielt (Tanzdatei + eigene Spuren der Figur)
    const diff = comparePoses(before, [await io.readBinary(tanzBin), await io.readBinary(bin)]);
    for (const [k, max] of Object.entries(MAX_DEVIATION))
      if (diff[k] > max) throw new Error(`${entry.file}: Pose weicht ab (${k} ${diff[k]} > ${max} bei ${diff.where})`);
    // gleicher Name = gleicher Inhalt (Fingerabdruck); schon vorhanden heißt: von einer anderen Figur geschrieben
    if (!(await stat(path.join(outDir, tanz)).catch(() => null))) await writeFile(path.join(outDir, tanz), tanzBin);
    await writeFile(dst, bin);
    await writeFile(dst + ".sha", `${stamp}\n${tanz}`);
    note = `  (${dropped} stille Spuren weg, ${moved} in ${tanz}, Abweichung ≤ ${diff.rotationDeg.toFixed(3)}°)`;
  }
  tanzFiles.add(tanz);
  await copyFile(path.join(srcDir, png), path.join(outDir, png));
  const size = (await stat(dst)).size;
  total += size;
  out.push({
    id: entry.file.replace(/\.glb$/, ""),
    url: `/avatars/${entry.file}`,
    preview: `/avatars/${png}`,
    bytes: size,
    tanz,
    triangles: entry.triangles,
    clips: entry.clips.map((c) => ({ name: c.name, seconds: c.seconds })),
  });
  console.log(
    `${fresh ? "✓ aktuell " : "✓ optimiert"} ${entry.file}  ${(buf.length / 1e6).toFixed(1)} MB → ${(size / 1e6).toFixed(2)} MB${note}`,
  );
}
await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(out, null, 2));
let tanzBytes = 0;
for (const t of tanzFiles) tanzBytes += (await stat(path.join(outDir, t))).size;
console.log(
  `Gesamt: ${(total / 1e6).toFixed(1)} MB Figuren + ${(tanzBytes / 1e6).toFixed(1)} MB in ${tanzFiles.size} gemeinsamen Tanzdateien`,
);
