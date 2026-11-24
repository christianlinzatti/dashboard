// Figurenteile zusammenlegen (läuft in scripts/optimize-avatars.mjs): weniger Zeichenaufrufe je Figur.
//
// Jede Figur besteht aus vielen Teilen mit je eigenem Material (Haut, Augen, Haare, Schuhe …), die sich meist nur in
// Farbe, Rauheit, Metallanteil und Leuchten unterscheiden. Diese Werte wandern hier in die Eckpunkte (COLOR_0, _RM,
// _EM); danach passen alle solchen Teile in ein einziges Teil mit einem gemeinsamen Material. Die Bühne liest die Werte
// je Eckpunkt (lib/avatars/vertex-pbr.ts) – das Bild bleibt gleich, weil jedes alte Teil genau einen Wert hatte.
//
// Getrennt bleiben: Materialien, die die App umfärbt (Anzug, Rüstung, Leuchtstreifen – siehe lib/avatars/outfits.ts),
// das LED-Display, Durchsichtiges und alles mit Textur oder Morph-Zielen.
//
// Liegt bewusst außerhalb von scripts/avatars, damit es die Versionen der erzeugten Figuren nicht ändert.
import { joinPrimitives } from "@gltf-transform/functions";

/** Materialien mit eigener Rolle zur Laufzeit (Umfärben) oder eigener Darstellung */
export const KEEP_MATERIAL = /stage suit|armor|luminous trim|LED display/i;
/** Name und Kennzeichen des gemeinsamen Materials (die Bühne erkennt es an extras.vertexPBR) */
export const SHARED_MATERIAL = "Figur (Werte je Eckpunkt)";

function mergeable(prim) {
  const m = prim.getMaterial();
  if (!m || KEEP_MATERIAL.test(m.getName())) return false;
  if (m.getAlphaMode() !== "OPAQUE") return false;
  if (prim.listTargets().length) return false;
  if (m.getBaseColorTexture() || m.getEmissiveTexture() || m.getNormalTexture() || m.getMetallicRoughnessTexture()) return false;
  if (m.getOcclusionTexture()) return false;
  return true;
}

/** Konstante Werte je Eckpunkt als neues Attribut */
function constant(doc, buffer, count, values) {
  const arr = new Float32Array(count * values.length);
  for (let i = 0; i < count; i++) arr.set(values, i * values.length);
  return doc
    .createAccessor()
    .setType(values.length === 2 ? "VEC2" : values.length === 3 ? "VEC3" : "VEC4")
    .setArray(arr)
    .setBuffer(buffer);
}

/** Gleiche Komponententypen je Attribut (z. B. JOINTS_0 nicht einmal als Byte, einmal als Short)? */
function sameTypes(prims) {
  for (const s of prims[0].listSemantics()) {
    const types = new Set(prims.map((p) => `${p.getAttribute(s)?.getComponentType()}:${p.getAttribute(s)?.getNormalized()}`));
    if (types.size > 1) return false;
  }
  return true;
}

/**
 * Legt je Mesh alle zusammenlegbaren Teile mit gleichem doubleSided-Wert zu einem Teil zusammen. Gibt zurück, wie
 * viele Teile es vorher und nachher waren.
 */
export function mergeStaticMaterials(doc) {
  const buffer = doc.getRoot().listBuffers()[0];
  let before = 0;
  let after = 0;
  const shared = new Map();
  for (const mesh of doc.getRoot().listMeshes()) {
    const prims = mesh.listPrimitives();
    before += prims.length;
    const groups = new Map();
    for (const p of prims) {
      if (!mergeable(p)) continue;
      const key = String(p.getMaterial().getDoubleSided());
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    for (const [doubleSided, group] of groups) {
      if (group.length < 2) continue;
      // gemeinsame Attribute: alle müssen dieselben haben – Texturkoordinaten braucht ohne Textur niemand
      for (const p of group)
        for (const s of p.listSemantics()) if (s.startsWith("TEXCOORD") || s.startsWith("TANGENT")) p.setAttribute(s, null);
      const sem = (p) => p.listSemantics().sort().join();
      if (new Set(group.map(sem)).size > 1) continue; // unterschiedliche Attribute: lieber getrennt lassen
      for (const p of group) {
        const m = p.getMaterial();
        const n = p.getAttribute("POSITION").getCount();
        const [r, g, b] = m.getBaseColorFactor();
        const strength = m.getExtension("KHR_materials_emissive_strength")?.getEmissiveStrength() ?? 1;
        const em = m.getEmissiveFactor().map((v) => v * strength);
        p.setAttribute("COLOR_0", constant(doc, buffer, n, [r, g, b]));
        p.setAttribute("_RM", constant(doc, buffer, n, [m.getRoughnessFactor(), m.getMetallicFactor()]));
        p.setAttribute("_EM", constant(doc, buffer, n, em));
      }
      if (!sameTypes(group)) {
        console.warn(`  Teile nicht zusammengelegt (unterschiedliche Datentypen): ${mesh.getName()}`);
        continue;
      }
      const key = `${SHARED_MATERIAL}|${doubleSided}`;
      if (!shared.has(key))
        shared.set(
          key,
          doc
            .createMaterial(SHARED_MATERIAL)
            .setBaseColorFactor([1, 1, 1, 1])
            .setRoughnessFactor(0.6)
            .setMetallicFactor(0)
            .setDoubleSided(doubleSided === "true")
            .setExtras({ vertexPBR: true }),
        );
      for (const p of group) p.setMaterial(shared.get(key));
      const joined = joinPrimitives(group);
      for (const p of group) {
        mesh.removePrimitive(p);
        p.dispose();
      }
      mesh.addPrimitive(joined);
    }
    after += mesh.listPrimitives().length;
  }
  return { before, after };
}
