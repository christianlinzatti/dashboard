import type { Material, MeshStandardMaterial, Object3D } from "three";

/**
 * Gemeinsames Figurenmaterial (scripts/avatar-merge.mjs): Farbe, Rauheit, Metallanteil und Leuchten stehen je Eckpunkt
 * statt je Material. Farbe liest three.js selbst (vertexColors); Rauheit/Metall (_rm) und Leuchten (_em) bringt diese
 * kleine Erweiterung des Standard-Shaders mit. Das Bild bleibt gleich – jedes zusammengelegte Teil trägt genau die
 * Werte seines alten Materials.
 */
export const VERTEX_PBR_KEY = "figur-werte-je-eckpunkt";

export function applyVertexPbr(m: MeshStandardMaterial) {
  if (m.userData.vertexPbrApplied) return;
  m.userData.vertexPbrApplied = true;
  m.vertexColors = true;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec2 _rm;\nattribute vec3 _em;\nvarying vec2 vFigRM;\nvarying vec3 vFigEM;",
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFigRM = _rm;\nvFigEM = _em;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFigRM;\nvarying vec3 vFigEM;")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vFigRM.x;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vFigRM.y;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance = vFigEM;");
  };
  // eigenes Programm im Shader-Cache (sonst teilte es sich eins mit unveränderten Standard-Materialien)
  m.customProgramCacheKey = () => VERTEX_PBR_KEY;
  m.needsUpdate = true;
}

/** Alle gemeinsamen Figurenmaterialien eines Modells erweitern (Kennzeichen aus dem Build: extras.vertexPBR) */
export function applyVertexPbrTo(model: Object3D) {
  model.traverse((o) => {
    const mats = (o as Object3D & { material?: Material | Material[] }).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : [])
      if (m.userData?.vertexPBR) applyVertexPbr(m as MeshStandardMaterial);
  });
}
