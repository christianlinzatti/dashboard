// Komprimiert die Avatare aus /avatars nach /public/avatars (Meshopt + Quantisierung)
// und erzeugt ein schlankes Manifest für die App. Läuft automatisch vor `next build`.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat, copyFile } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { cloneDocument, dedup, prune, quantize, resample, weld, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { comparePoses, dropStaticChannels, packRotations } from "./avatar-anim.mjs";
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
for (const entry of manifest) {
  // erzeugte Figuren (scripts/avatars/build-characters.mjs) liegen nicht im Repo, sondern unter avatars/generated
  const src = path.join(srcDir, entry.generated ? "generated" : "", entry.file);
  const dst = path.join(outDir, entry.file);
  const png = entry.file.replace(/\.glb$/, ".png");
  const buf = await readFile(src);
  const sha = createHash("sha256").update(buf).digest("hex");
  if (!entry.generated && sha !== entry.sha256) throw new Error(`Prüfsumme stimmt nicht: ${entry.file}`);

  // Nur neu komprimieren, wenn sich die Quelldatei geändert hat.
  // (auch wenn sich das Verfahren hier geändert hat: OPTIMIZE_VERSION)
  const stamp = `${sha}:${OPTIMIZE_VERSION}`;
  const fresh = !force && (await readFile(dst + ".sha", "utf8").catch(() => "")) === stamp;
  let note = "";
  if (!fresh) {
    const doc = await io.readBinary(buf);
    await doc.transform(dedup(), prune(), weld(), resample());
    const before = cloneDocument(doc);
    // Tanz-Spuren verschlanken: stillstehende Spuren weg, Drehungen als Int16 (Bewegung bleibt gleich)
    const dropped = dropStaticChannels(doc);
    packRotations(doc);
    await doc.transform(prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
    const bin = await io.writeBinary(doc);
    // Probe: jede Pose vor dem Verschlanken gegen das ausgelieferte Ergebnis
    const diff = comparePoses(before, await io.readBinary(bin));
    for (const [k, max] of Object.entries(MAX_DEVIATION))
      if (diff[k] > max) throw new Error(`${entry.file}: Pose weicht ab (${k} ${diff[k]} > ${max} bei ${diff.where})`);
    await writeFile(dst, bin);
    await writeFile(dst + ".sha", stamp);
    note = `  (${dropped} stille Spuren weg, Abweichung ≤ ${diff.rotationDeg.toFixed(3)}°)`;
  }
  await copyFile(path.join(srcDir, png), path.join(outDir, png));
  const size = (await stat(dst)).size;
  total += size;
  out.push({
    id: entry.file.replace(/\.glb$/, ""),
    url: `/avatars/${entry.file}`,
    preview: `/avatars/${png}`,
    bytes: size,
    triangles: entry.triangles,
    clips: entry.clips.map((c) => ({ name: c.name, seconds: c.seconds })),
  });
  console.log(
    `${fresh ? "✓ aktuell " : "✓ optimiert"} ${entry.file}  ${(buf.length / 1e6).toFixed(1)} MB → ${(size / 1e6).toFixed(2)} MB${note}`,
  );
}
await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(out, null, 2));
console.log(`Gesamt: ${(total / 1e6).toFixed(1)} MB`);
