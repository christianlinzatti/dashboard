import { describe, expect, it } from "vitest";
import { Document } from "@gltf-transform/core";
import { MeshStandardMaterial, ShaderLib } from "three";
import { applyVertexPbr } from "@/lib/avatars/vertex-pbr";
// @ts-expect-error – Bauskript ohne Typen
import { mergeStaticMaterials } from "../../scripts/avatar-merge.mjs";

/** Figur mit Haut, Haaren (zusammenlegbar), Anzug (wird umgefärbt), Blush (durchsichtig) */
function figure() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh("Figur");
  doc.createScene().addChild(doc.createNode("Figur").setMesh(mesh));
  const part = (name: string, color: [number, number, number], rough: number, metal: number, emissive = [0, 0, 0]) => {
    const m = doc
      .createMaterial(name)
      .setBaseColorFactor([...color, 1])
      .setRoughnessFactor(rough)
      .setMetallicFactor(metal);
    m.setEmissiveFactor(emissive as [number, number, number]);
    const pos = doc
      .createAccessor()
      .setType("VEC3")
      .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))
      .setBuffer(buffer);
    const nrm = doc
      .createAccessor()
      .setType("VEC3")
      .setArray(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]))
      .setBuffer(buffer);
    mesh.addPrimitive(doc.createPrimitive().setAttribute("POSITION", pos).setAttribute("NORMAL", nrm).setMaterial(m));
    return m;
  };
  part("Skin", [0.8, 0.6, 0.5], 0.7, 0);
  part("Hair", [0.2, 0.1, 0.05], 0.4, 0.1, [0.1, 0, 0]);
  part("Hoodie stage suit", [0.1, 0.1, 0.4], 0.8, 0);
  part("Blush", [1, 0.5, 0.5], 0.9, 0).setAlphaMode("BLEND");
  return { doc, mesh };
}

describe("Figurenteile zusammenlegen (scripts/avatar-merge.mjs)", () => {
  it("gleichartige Teile zu einem, Werte je Eckpunkt; Umfärbbares und Durchsichtiges bleibt getrennt", () => {
    const { doc, mesh } = figure();
    expect(mergeStaticMaterials(doc)).toEqual({ before: 4, after: 3 });
    const names = mesh.listPrimitives().map((p) => p.getMaterial()!.getName());
    expect(names).toContain("Hoodie stage suit");
    expect(names).toContain("Blush");
    const merged = mesh.listPrimitives().find((p) => p.getMaterial()!.getExtras().vertexPBR)!;
    expect(merged.getAttribute("POSITION")!.getCount()).toBe(6);
    const col = Array.from(merged.getAttribute("COLOR_0")!.getArray()! as Float32Array);
    const rm = Array.from(merged.getAttribute("_RM")!.getArray()! as Float32Array);
    const em = Array.from(merged.getAttribute("_EM")!.getArray()! as Float32Array);
    // erster Eckpunkt aus der Haut, letzter aus den Haaren
    expect(col.slice(0, 3).map((v) => +v.toFixed(3))).toEqual([0.8, 0.6, 0.5]);
    expect(col.slice(-3).map((v) => +v.toFixed(3))).toEqual([0.2, 0.1, 0.05]);
    expect(rm.slice(0, 2).map((v) => +v.toFixed(3))).toEqual([0.7, 0]);
    expect(rm.slice(-2).map((v) => +v.toFixed(3))).toEqual([0.4, 0.1]);
    expect(em.slice(-3).map((v) => +v.toFixed(3))).toEqual([0.1, 0, 0]);
  });

  it("nur ein zusammenlegbares Teil: nichts zu tun", () => {
    const { doc } = figure();
    const skin = doc
      .getRoot()
      .listMaterials()
      .find((m) => m.getName() === "Hair")!;
    skin.setAlphaMode("MASK");
    expect(mergeStaticMaterials(doc)).toEqual({ before: 4, after: 4 });
  });
});

describe("Bühne: Werte je Eckpunkt im Standard-Shader (lib/avatars/vertex-pbr.ts)", () => {
  it("ersetzt Rauheit, Metall und Leuchten durch die Eckpunkt-Werte – schlägt an, wenn three.js die Bausteine umbenennt", () => {
    const m = new MeshStandardMaterial();
    m.userData.vertexPBR = true;
    applyVertexPbr(m);
    expect(m.vertexColors).toBe(true);
    const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(shader as never, undefined as never);
    expect(shader.vertexShader).toContain("attribute vec2 _rm;");
    expect(shader.vertexShader).toContain("vFigRM = _rm;");
    expect(shader.fragmentShader).toContain("float roughnessFactor = vFigRM.x;");
    expect(shader.fragmentShader).toContain("float metalnessFactor = vFigRM.y;");
    expect(shader.fragmentShader).toContain("totalEmissiveRadiance = vFigEM;");
    expect(shader.fragmentShader).not.toContain("#include <roughnessmap_fragment>");
    expect(m.customProgramCacheKey()).toBe("figur-werte-je-eckpunkt");
    // zweimal anwenden ändert nichts
    const before = m.onBeforeCompile;
    applyVertexPbr(m);
    expect(m.onBeforeCompile).toBe(before);
  });
});
