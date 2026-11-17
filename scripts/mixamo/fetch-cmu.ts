/**
 * Tanz-Aufnahmen aus der CMU Graphics Lab Motion Capture Database nach ./cmu laden (BVH-Umwandlung von
 * Bruce Hahne/cgspeed, gespiegelt auf GitHub). Die Daten sind frei verwendbar, auch kommerziell.
 * Danach `npm run mixamo` – das Skript wandelt Mixamo-FBX, Mesh2Motion-GLB und CMU-BVH gemeinsam um.
 *
 *   npm run cmu                 die Auswahl unten
 *   npm run cmu -- 60_02 61_01  weitere Aufnahmen (Nummer aus dem CMU-Index), z. B. „salsa_60_02.bvh“
 *
 * Der Dateiname beschreibt den Tanz („salsa_60_01.bvh“) – daraus entstehen ID, Stil und Ersatz-Clip.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data";

/** Auswahl aus den Tanz-Aufnahmen des CMU-Index: Aufnahme → Name */
export const CMU_DANCES: Record<string, string> = {
  "55_02": "lambada",
  "60_01": "salsa",
  "93_03": "charleston",
  "93_08": "charleston-fancy",
  "90_30": "russian-dance",
  "90_28": "breakdance",
  "141_12": "twist",
  "143_35": "macarena",
  "120_05": "mickey-dance",
  "94_01": "indian-dance",
  "111_05": "dance",
  "103_03": "charleston",
  "103_04": "charleston-side-by-side",
  "103_05": "charleston-side-by-side",
  "103_06": "lindy-hop",
  "103_08": "charleston-fancy",
  "120_06": "mickey-dance",
  "120_07": "mickey-dance",
  "90_31": "russian-dance",
  "113_04": "dance",
  "143_34": "chicken-dance",
  "18_15": "chicken-dance",
};

/** Proband → Tanz (für Aufnahmen, die über die Nummer geladen werden) */
export const CMU_SUBJECTS: Record<string, string> = {
  "05": "ballet",
  "49": "ballet",
  "55": "dance",
  "60": "salsa",
  "61": "salsa",
  "93": "charleston",
  "94": "indian-dance",
  "103": "charleston",
};

/** Dateiname für eine Aufnahme: „salsa_60_02.bvh“ – Name aus der Auswahl, sonst nach Proband */
export function cmuFileName(take: string): string {
  return `${CMU_DANCES[take] ?? CMU_SUBJECTS[take.split("_")[0]!] ?? "cmu"}_${take}.bvh`;
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => /^\d+_\d+$/.test(a));
  const takes = wanted.length ? wanted : Object.keys(CMU_DANCES);
  const dir = join(process.cwd(), "cmu");
  mkdirSync(dir, { recursive: true });
  let failed = 0;
  for (const take of takes) {
    const file = cmuFileName(take);
    if (existsSync(join(dir, file))) {
      console.log(`· ${file} schon da`);
      continue;
    }
    const subject = take.split("_")[0]!.padStart(3, "0");
    const res = await fetch(`${BASE}/${subject}/${take}.bvh`);
    const text = res.ok ? await res.text() : "";
    if (!text.startsWith("HIERARCHY")) {
      console.log(`✗ ${take}: ${res.ok ? "keine BVH-Datei" : `HTTP ${res.status}`}`);
      failed++;
      continue;
    }
    writeFileSync(join(dir, file), text);
    console.log(`✓ ${file} (${(text.length / 1024).toFixed(0)} KB)`);
  }
  console.log(`\nWeiter mit: npm run mixamo`);
  if (failed) process.exitCode = 1;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/mixamo/fetch-cmu.ts")) void main();
