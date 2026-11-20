// Neue Avatare aus Formen bauen: Skelett und alle Tanz-Clips stammen von einem vorhandenen Avatar (gleiche Knochen,
// gleiche Animationen), der Körper wird neu aus abgerundeten Formen erzeugt und an die Knochen gebunden. So entstehen
// ganz andere Figuren, die trotzdem jeden Tanz können. Die Figuren stehen in scripts/avatars/figuren/*.mjs.
//
// Die erzeugten GLBs werden nicht eingecheckt (je ~4 MB, fast nur kopierte Animationen): Sie entstehen beim Build
// (`prebuild`) unter avatars/generated/. Jede Figur trägt eine Version aus ihren Quellen (Figurendatei, Bausteine,
// Grundmodell) – nur Geändertes wird neu gebaut, und die Adresse im Browser-Cache wechselt mit.
//
//   node scripts/avatars/build-characters.mjs              → fehlende/veraltete bauen, avatars/manifest.json ergänzen
//   node scripts/avatars/build-characters.mjs --force      → alle neu
//   node scripts/avatars/build-characters.mjs dino …       → nur diese (immer neu)
//
// Danach: Vorschaubilder (scripts/avatars/render-previews.mjs) und `npm run avatars` (Komprimieren nach /public).
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { Builder, vec } from "./geometry.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const dir = path.join(root, "avatars");
const outDir = path.join(dir, "generated");
const figurenDir = path.join(import.meta.dirname, "figuren");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// ---------------------------------------------------------------- Mathe für Matrizen (Spalten-Major wie glTF)

function mat4Mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
const translation = ([x, y, z]) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

/** Glatte Normalen je Material-Gruppe */
function normals(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    const p = (k) => [positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]];
    const f = vec.cross(vec.sub(p(b), p(a)), vec.sub(p(c), p(a)));
    for (const k of [a, b, c]) for (let d = 0; d < 3; d++) n[k * 3 + d] += f[d];
  }
  for (let k = 0; k < n.length; k += 3) {
    const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1;
    n[k] /= l;
    n[k + 1] /= l;
    n[k + 2] /= l;
  }
  return n;
}

const hex = (h) => [1, 3, 5].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255) ** 2.2);

// ---------------------------------------------------------------- Bauen

/**
 * Jede Figur: Grundmodell (Skelett, Clips, Gesichtsart), Materialien, verschobene Gesichtsknochen (Gesicht auf der
 * neuen Kopfform) und der Körper. Materialnamen mit „stage suit“, „armor“, „luminous trim“ nehmen Outfit- und
 * Künstlerfarben an (lib/avatars/outfits.ts).
 */
async function build(id, spec) {
  const doc = await io.read(path.join(dir, `${spec.base}.glb`));
  const r = doc.getRoot();
  const buffer = r.listBuffers()[0];
  const skin = r.listSkins()[0];
  const joints = skin.listJoints();
  const byName = new Map(joints.map((j) => [j.getName(), j]));
  const index = new Map(joints.map((j, i) => [j.getName(), i]));

  // Gesichtsknochen auf die neue Kopfform verschieben: Ruhelage, alle Positions-Schlüssel und die Bind-Matrix
  const ibm = skin.getInverseBindMatrices();
  const ibmArr = Array.from(ibm.getArray());
  for (const [name, delta] of Object.entries(spec.shift ?? {})) {
    const node = byName.get(name);
    if (!node) throw new Error(`${id}: Knochen ${name} fehlt im Grundmodell ${spec.base}`);
    const t = node.getTranslation();
    node.setTranslation([t[0] + delta[0], t[1] + delta[1], t[2] + delta[2]]);
    for (const anim of r.listAnimations())
      for (const ch of anim.listChannels()) {
        if (ch.getTargetNode() !== node || ch.getTargetPath() !== "translation") continue;
        const s = ch.getSampler();
        const out = Array.from(s.getOutput().getArray());
        for (let i = 0; i < out.length; i += 3) for (let d = 0; d < 3; d++) out[i + d] += delta[d];
        // Schlüssel können geteilt sein – eigene Kopie
        s.setOutput(doc.createAccessor().setType("VEC3").setArray(new Float32Array(out)).setBuffer(buffer));
      }
    const k = index.get(name);
    const m = mat4Mul(ibmArr.slice(k * 16, k * 16 + 16), translation(delta.map((v) => -v)));
    ibmArr.splice(k * 16, 16, ...m);
  }
  skin.setInverseBindMatrices(doc.createAccessor().setType("MAT4").setArray(new Float32Array(ibmArr)).setBuffer(buffer));

  // Gelenkpositionen in der Grundhaltung
  const world = (name) => {
    const k = index.get(name);
    const inv = ibmArr.slice(k * 16, k * 16 + 16);
    // Position = −R⁻¹·t aus der inversen Bind-Matrix (Rotation orthonormal)
    const [tx, ty, tz] = [inv[12], inv[13], inv[14]];
    return [
      -(inv[0] * tx + inv[1] * ty + inv[2] * tz),
      -(inv[4] * tx + inv[5] * ty + inv[6] * tz),
      -(inv[8] * tx + inv[9] * ty + inv[10] * tz),
    ];
  };
  const J = Object.fromEntries(joints.map((j) => [j.getName(), world(j.getName())]));

  const b = new Builder();
  spec.body(b, J, J);

  // alten Körper entfernen, neuen anhängen
  const meshNode = r.listNodes().find((n) => n.getMesh() && n.getSkin());
  const old = meshNode.getMesh();
  const mesh = doc.createMesh(`${spec.title} Body`);
  let triangles = 0;
  for (const [matName, g] of b.parts) {
    const def = spec.materials[matName];
    if (!def) throw new Error(`${id}: Material ${matName} nicht definiert`);
    const color = hex(def.color);
    const mat = doc
      .createMaterial(matName)
      .setBaseColorFactor([...color, 1])
      .setMetallicFactor(def.metal ?? 0.1)
      .setRoughnessFactor(def.rough ?? 0.5)
      .setEmissiveFactor(def.emissive ? color.map((c) => Math.min(1, c * def.emissive * 1.6)) : [0, 0, 0]);
    const count = g.positions.length / 3;
    const jArr = new Uint8Array(count * 4);
    const wArr = new Float32Array(count * 4);
    g.skins.forEach((list, v) => {
      const merged = new Map();
      for (const [bone, w] of list) {
        if (!index.has(bone)) throw new Error(`${id}: Knochen ${bone} fehlt`);
        merged.set(bone, (merged.get(bone) ?? 0) + w);
      }
      const top = [...merged].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
      top.forEach(([bone, w], k) => {
        jArr[v * 4 + k] = index.get(bone);
        wArr[v * 4 + k] = w / sum;
      });
    });
    const pos = new Float32Array(g.positions);
    const idx = count > 65535 ? new Uint32Array(g.indices) : new Uint16Array(g.indices);
    triangles += g.indices.length / 3;
    const prim = doc
      .createPrimitive()
      .setMaterial(mat)
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(idx).setBuffer(buffer))
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(normals(pos, g.indices)).setBuffer(buffer))
      .setAttribute("JOINTS_0", doc.createAccessor().setType("VEC4").setArray(jArr).setBuffer(buffer))
      .setAttribute("WEIGHTS_0", doc.createAccessor().setType("VEC4").setArray(wArr).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }
  meshNode.setMesh(mesh).setName(`${spec.title} Body`);
  old.dispose();
  const rig = r.listScenes()[0].listChildren()[0];
  rig?.setName(`${spec.title} Rig`);
  await doc.transform(prune());
  const glb = Buffer.from(await io.writeBinary(doc));
  await writeFile(path.join(outDir, `${id}.glb`), glb);
  return { glb, triangles, joints: joints.length, clips: r.listAnimations().map((a) => a.getName()) };
}

const manifestPath = path.join(dir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const args = process.argv.slice(2);
const force = args.includes("--force");
const wanted = args.filter((a) => !a.startsWith("--"));
await mkdir(outDir, { recursive: true });

const sha = (...parts) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex");
};
// gemeinsame Quellen: Baupipeline und Bausteine
const shared = sha(
  await readFile(import.meta.filename),
  await readFile(path.join(import.meta.dirname, "geometry.mjs")),
  await readFile(path.join(import.meta.dirname, "parts.mjs")),
);

const groups = (await readdir(figurenDir)).filter((f) => f.endsWith(".mjs")).sort();
const seen = new Set();
for (const file of groups) {
  const source = await readFile(path.join(figurenDir, file));
  const { default: characters } = await import(path.join(figurenDir, file));
  for (const [id, spec] of Object.entries(characters)) {
    if (seen.has(id)) throw new Error(`Figur ${id} doppelt (${file})`);
    seen.add(id);
    const base = manifest.find((m) => m.file === `${spec.base}.glb` && !m.generated);
    if (!base) throw new Error(`${id}: Grundmodell ${spec.base} fehlt im Manifest`);
    const version = sha(shared, source, base.sha256, id).slice(0, 16);
    const at = manifest.findIndex((m) => m.file === `${id}.glb`);
    const old = at >= 0 ? manifest[at] : undefined;
    const built = (await readFile(path.join(outDir, `${id}.glb.version`), "utf8").catch(() => "")) === version;
    if (!force && !wanted.includes(id) && (wanted.length || (built && old?.version === version))) continue;
    const { glb, triangles, joints } = await build(id, spec);
    await writeFile(path.join(outDir, `${id}.glb.version`), version);
    const entry = {
      file: `${id}.glb`,
      generated: true,
      base: spec.base,
      version,
      motionVersion: base.motionVersion,
      triangles,
      joints,
      clips: base.clips,
    };
    if (at >= 0) manifest[at] = entry;
    else manifest.push(entry);
    console.log(`✓ erzeugt ${id}: ${triangles} Dreiecke, ${(glb.length / 1e6).toFixed(1)} MB`);
  }
}
// Figuren, die es nicht mehr gibt, fliegen aus dem Manifest
const kept = manifest.filter((m) => !m.generated || seen.has(m.file.replace(/\.glb$/, "")));
await writeFile(manifestPath, JSON.stringify(kept, null, 2) + "\n");
