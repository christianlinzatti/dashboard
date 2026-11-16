/**
 * Tanz-Animationen von Mesh2Motion (CC0, https://github.com/Mesh2Motion/mesh2motion-app) nach ./mesh2motion laden.
 * Danach `npm run mixamo` – das Skript wandelt Mixamo-FBX und Mesh2Motion-GLB gemeinsam um.
 *
 *   npm run mesh2motion                    die Tänze unten
 *   npm run mesh2motion -- clapping dab    weitere Animationen aus static/assets/human/animations
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://raw.githubusercontent.com/Mesh2Motion/mesh2motion-app/main/static/assets/human/animations";
export const MESH2MOTION_DANCES = ["dance-simple", "dance-arm-pump", "dance-body-roll", "dance-charleston", "dance-reach-hip"];

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const names = (wanted.length ? wanted : MESH2MOTION_DANCES).map((n) => n.replace(/\.glb$/i, ""));
  const dir = join(process.cwd(), "mesh2motion");
  mkdirSync(dir, { recursive: true });
  let failed = 0;
  for (const name of names) {
    const target = join(dir, `${name}.glb`);
    if (existsSync(target)) {
      console.log(`· ${name}.glb schon da`);
      continue;
    }
    const res = await fetch(`${BASE}/${encodeURIComponent(name)}.glb`);
    if (!res.ok) {
      console.log(`✗ ${name}.glb: HTTP ${res.status}`);
      failed++;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.subarray(0, 4).toString() !== "glTF") {
      console.log(`✗ ${name}.glb: keine GLB-Datei`);
      failed++;
      continue;
    }
    writeFileSync(target, buf);
    console.log(`✓ ${name}.glb (${(buf.length / 1024).toFixed(0)} KB)`);
  }
  console.log(`\nWeiter mit: npm run mixamo`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/mixamo/fetch-mesh2motion.ts")) void main();
