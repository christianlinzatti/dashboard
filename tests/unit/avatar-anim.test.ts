import { describe, expect, it } from "vitest";
import { Accessor, Document } from "@gltf-transform/core";
// @ts-expect-error – Bauskript ohne Typen
import { comparePoses, dropStaticChannels, packRotations } from "../../scripts/avatar-anim.mjs";

/** Kleines Skelett mit einem Tanz: Arm dreht sich, Hüfte wippt, alles andere steht still in Ruhehaltung */
function dance() {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const hips = doc.createNode("Hips").setTranslation([0, 1, 0]);
  const arm = doc.createNode("Arm").setTranslation([0.2, 0.4, 0]).setRotation([0, 0, 0, 1]);
  const eye = doc.createNode("Eye").setScale([1, 1, 1]);
  doc.createScene().addChild(hips);
  hips.addChild(arm).addChild(eye);
  const times = doc
    .createAccessor()
    .setType("SCALAR")
    .setArray(new Float32Array([0, 0.5, 1]))
    .setBuffer(buffer);
  const anim = doc.createAnimation("Tanz");
  const track = (node: ReturnType<Document["createNode"]>, path: "translation" | "rotation" | "scale", values: number[]) => {
    const out = doc
      .createAccessor()
      .setType(path === "rotation" ? "VEC4" : "VEC3")
      .setArray(new Float32Array(values))
      .setBuffer(buffer);
    const sampler = doc.createAnimationSampler().setInput(times).setOutput(out).setInterpolation("LINEAR");
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
  };
  const s = Math.SQRT1_2;
  track(hips, "translation", [0, 1, 0, 0, 1.1, 0, 0, 1, 0]); // wippt
  track(arm, "rotation", [0, 0, 0, 1, 0, 0, s, s, 0, 0, 0, 1]); // dreht
  track(arm, "translation", [0.2, 0.4, 0, 0.2, 0.4, 0, 0.2, 0.4, 0]); // steht (= Ruhehaltung)
  track(arm, "scale", [1, 1, 1, 1, 1, 1, 1, 1, 1]); // steht
  track(eye, "rotation", [0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0, -1]); // −q = q: steht
  track(eye, "scale", [1, 1, 1, 1, 0.1, 1, 1, 1, 1]); // blinzelt
  return { doc, anim };
}

const paths = (anim: ReturnType<Document["createAnimation"]>) =>
  anim
    .listChannels()
    .map((c) => `${c.getTargetNode()!.getName()}.${c.getTargetPath()}`)
    .sort();

describe("Avatar-Tänze verschlanken (scripts/avatar-anim.mjs)", () => {
  it("entfernt nur Spuren, die überall der Ruhehaltung entsprechen – Bewegung bleibt", () => {
    const { doc, anim } = dance();
    expect(dropStaticChannels(doc)).toBe(3);
    expect(paths(anim)).toEqual(["Arm.rotation", "Eye.scale", "Hips.translation"]);
    expect(anim.listSamplers()).toHaveLength(3);
  });

  it("eine Spur, die von der Ruhehaltung abweicht (auch konstant), bleibt erhalten", () => {
    const { doc, anim } = dance();
    anim
      .listChannels()
      .find((c) => c.getTargetNode()!.getName() === "Arm" && c.getTargetPath() === "translation")!
      .getSampler()!
      .getOutput()!
      .setArray(new Float32Array([0.2, 0.3, 0, 0.2, 0.3, 0, 0.2, 0.3, 0]));
    dropStaticChannels(doc);
    expect(paths(anim)).toContain("Arm.translation");
  });

  it("Drehungen als Int16: Posen-Probe findet keine sichtbare Abweichung, eine echte Änderung schon", () => {
    const { doc: before } = dance();
    const { doc: after } = dance();
    dropStaticChannels(after);
    expect(packRotations(after)).toBe(1);
    const out = after
      .getRoot()
      .listAccessors()
      .find((a) => a.getArray() instanceof Int16Array)!;
    expect(out.getNormalized()).toBe(true);
    expect(out.getComponentType()).toBe(Accessor.ComponentType.SHORT);
    const ok = comparePoses(before, after);
    expect(ok.rotationDeg).toBeLessThan(0.01);
    expect(ok.translation).toBeLessThan(1e-6); // Float32-Rundung
    expect(ok.scale).toBeLessThan(1e-6);

    // Fehler einbauen: Hüfte wippt nicht mehr → Probe meldet es mit Ort
    const hips = after
      .getRoot()
      .listAnimations()[0]!
      .listChannels()
      .find((c) => c.getTargetNode()!.getName() === "Hips")!;
    hips.dispose();
    const bad = comparePoses(before, after);
    expect(bad.translation).toBeCloseTo(0.1);
    expect(bad.where).toBe("Tanz Hips.translation");
  });
});
