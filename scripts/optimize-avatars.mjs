// Komprimiert die Avatare aus /avatars nach /public/avatars (Meshopt + Quantisierung)
// und erzeugt ein schlankes Manifest für die App. Läuft automatisch vor `next build`.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat, copyFile } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, quantize, resample, weld, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

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
  const src = path.join(srcDir, entry.file);
  const dst = path.join(outDir, entry.file);
  const png = entry.file.replace(/\.glb$/, ".png");
  const buf = await readFile(src);
  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== entry.sha256) throw new Error(`Prüfsumme stimmt nicht: ${entry.file}`);

  // Nur neu komprimieren, wenn sich die Quelldatei geändert hat.
  const fresh = !force && (await readFile(dst + ".sha", "utf8").catch(() => "")) === sha;
  if (!fresh) {
    const doc = await io.readBinary(buf);
    await doc.transform(dedup(), prune(), weld(), resample(), quantize(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
    await writeFile(dst, await io.writeBinary(doc));
    await writeFile(dst + ".sha", sha);
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
  console.log(`${fresh ? "✓ aktuell " : "✓ optimiert"} ${entry.file}  ${(buf.length / 1e6).toFixed(1)} MB → ${(size / 1e6).toFixed(2)} MB`);
}
await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(out, null, 2));
console.log(`Gesamt: ${(total / 1e6).toFixed(1)} MB`);
