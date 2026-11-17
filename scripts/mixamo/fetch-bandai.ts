/**
 * Tanzaufnahmen aus dem Bandai Namco Research Motiondataset nach ./bandai laden
 * (https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset).
 *
 * Lizenz: CC BY-NC 4.0 – nur nicht-kommerziell, mit Namensnennung (siehe docs/MIXAMO.md).
 *
 * Die beiden Tanzaufnahmen (158 s und 63 s) bestehen aus vielen verschiedenen Figuren. Sie werden in
 * 16,5-s-Ausschnitte zerlegt; jeder bekommt das erste Bild der Aufnahme (stehende Ausgangshaltung)
 * vorangestellt – es dient beim Umwandeln als Ruhepose. Danach `npm run mixamo`.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE =
  "https://raw.githubusercontent.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset/master/dataset/Bandai-Namco-Research-Motiondataset-1/data";
export const BANDAI_DANCES = {
  "dance-long": "dataset-1_dance-long_normal_001.bvh",
  "dance-short": "dataset-1_dance-short_normal_001.bvh",
};
const WINDOW_S = 16.5;
const MIN_S = 8;

/** BVH in Ausschnitte zerlegen; erstes Bild der Aufnahme jeweils vorn (Ruhepose). */
export function splitBvh(text: string, windowS = WINDOW_S, minS = MIN_S): string[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const motion = lines.findIndex((l) => l.trim() === "MOTION");
  const frameTime = Number(lines[motion + 2]!.split(/[:\s]+/).at(-1));
  const frames = lines.slice(motion + 3).filter((l) => l.trim());
  if (motion < 0 || !(frameTime > 0) || !frames.length) throw new Error("keine BVH-Bewegungsdaten");
  const per = Math.round(windowS / frameTime);
  const header = lines.slice(0, motion + 1).join("\n");
  const out: string[] = [];
  for (let start = 1; start < frames.length; start += per) {
    const chunk = frames.slice(start, start + per);
    if (chunk.length * frameTime < minS) break;
    const body = [frames[0]!, ...chunk];
    out.push(`${header}\nFrames: ${body.length}\nFrame Time: ${frameTime}\n${body.join("\n")}\n`);
  }
  return out;
}

async function main() {
  const dir = join(process.cwd(), "bandai");
  mkdirSync(dir, { recursive: true });
  let failed = 0;
  for (const [name, file] of Object.entries(BANDAI_DANCES)) {
    if (existsSync(join(dir, `bandai_${name}_01.bvh`))) {
      console.log(`· ${name} schon da`);
      continue;
    }
    const res = await fetch(`${BASE}/${file}`);
    const text = res.ok ? await res.text() : "";
    if (!text.startsWith("HIERARCHY")) {
      console.log(`✗ ${name}: ${res.ok ? "keine BVH-Datei" : `HTTP ${res.status}`}`);
      failed++;
      continue;
    }
    const parts = splitBvh(text);
    parts.forEach((p, i) => writeFileSync(join(dir, `bandai_${name}_${String(i + 1).padStart(2, "0")}.bvh`), p));
    console.log(`✓ ${name}: ${parts.length} Ausschnitte à ${WINDOW_S} s`);
  }
  console.log(`\nWeiter mit: npm run mixamo`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/mixamo/fetch-bandai.ts")) void main();
