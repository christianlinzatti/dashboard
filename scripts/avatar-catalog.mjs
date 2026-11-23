// Kompakter Avatar-Katalog für den Client (lib/avatars/catalog.json) aus dem Build-Manifest (avatars/manifest.json).
// Der Client braucht je Avatar nur ID, Cache-Version und Clip-Namen; Prüfsummen, Dreiecke, Clip-Längen usw. sind
// Build-Daten. Gleiche Clip-Listen werden nur einmal gespeichert (50 Avatare teilen sich eine Handvoll Listen).
//
//   node scripts/avatar-catalog.mjs   → schreibt lib/avatars/catalog.json (läuft im prebuild nach build-characters)
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/** Manifest → { clipSets: string[][], avatars: [{ id, v, c }] } (c = Index der Clip-Liste) */
export function compactCatalog(manifest) {
  const clipSets = [];
  const index = new Map();
  const avatars = manifest.map((m) => {
    const clips = m.clips.map((c) => c.name);
    const key = clips.join("|");
    if (!index.has(key)) {
      index.set(key, clipSets.length);
      clipSets.push(clips);
    }
    // Version: Prüfsumme der Quelldatei bzw. bei erzeugten Figuren die Version aus ihren Quellen
    const v = (m.sha256 || m.version || "").slice(0, 12);
    return { id: m.file.replace(/\.glb$/, ""), v, c: index.get(key) };
  });
  return { clipSets, avatars };
}

export async function writeCatalog() {
  const manifest = JSON.parse(await readFile(path.join(root, "avatars", "manifest.json"), "utf8"));
  const out = path.join(root, "lib", "avatars", "catalog.json");
  await writeFile(out, JSON.stringify(compactCatalog(manifest)) + "\n");
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`✓ ${path.relative(root, await writeCatalog())}`);
}
