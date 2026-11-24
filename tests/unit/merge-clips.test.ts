import { describe, expect, it } from "vitest";
import { AnimationClip, NumberKeyframeTrack, QuaternionKeyframeTrack } from "three";
import { Document } from "@gltf-transform/core";
import { createHash } from "node:crypto";
import { mergeClips } from "@/lib/avatars/merge-clips";
// @ts-expect-error – Bauskript ohne Typen
import { comparePoses, sharedSignature, splitSharedClips } from "../../scripts/avatar-anim.mjs";

const q = (name: string, n = 2) => new QuaternionKeyframeTrack(`${name}.quaternion`, [0, n], [0, 0, 0, 1, 0, 0, 0, 1]);
const s = (name: string, end: number) => new NumberKeyframeTrack(`${name}.scale[y]`, [0, end], [1, 0.1]);

describe("Tänze zusammensetzen (gemeinsame Tanzdatei + Figur)", () => {
  it("Skelett- und Gesichtsspuren je Clip vereint, Länge = längste Spur, Spuren werden geteilt statt kopiert", () => {
    const shared = [new AnimationClip("Dance_A", 4, [q("Hips", 4), q("LeftArm", 4)]), new AnimationClip("Idle", 2, [q("Head")])];
    const own = [new AnimationClip("Dance_A", 2, [s("FaceEyeLeft", 2)]), new AnimationClip("Nur_Figur", 1, [s("FaceSmile", 1)])];
    const out = mergeClips(shared, own);
    expect(out.map((c) => c.name)).toEqual(["Dance_A", "Idle", "Nur_Figur"]);
    const a = out[0]!;
    expect(a.duration).toBe(4);
    expect(a.tracks.map((t) => t.name)).toEqual(["Hips.quaternion", "LeftArm.quaternion", "FaceEyeLeft.scale[y]"]);
    expect(a.tracks[0]).toBe(shared[0]!.tracks[0]);
    expect(out[1]).toBe(shared[1]); // nichts Eigenes: der gemeinsame Clip selbst
  });
});

/** Figur mit Skelett (Hips, LeftArm) und Gesicht (FaceEyeLeft), ein Modell, zwei Clips */
function figure(armTurn = Math.SQRT1_2) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const hips = doc.createNode("Hips");
  const arm = doc.createNode("LeftArm");
  const eye = doc.createNode("FaceEyeLeft");
  const body = doc.createNode("Body").setMesh(doc.createMesh("Body").addPrimitive(doc.createPrimitive()));
  doc.createScene().addChild(hips).addChild(body);
  hips.addChild(arm).addChild(eye);
  const acc = (type: "SCALAR" | "VEC3" | "VEC4", v: number[]) =>
    doc.createAccessor().setType(type).setArray(new Float32Array(v)).setBuffer(buffer);
  const times = acc("SCALAR", [0, 1]);
  const track = (anim: ReturnType<Document["createAnimation"]>, node: typeof hips, path: "rotation" | "scale", v: number[]) => {
    const smp = doc
      .createAnimationSampler()
      .setInput(times)
      .setOutput(acc(path === "rotation" ? "VEC4" : "VEC3", v));
    anim.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(smp));
  };
  const dance = doc.createAnimation("Dance_A");
  track(dance, hips, "rotation", [0, 0, 0, 1, 0, Math.SQRT1_2, 0, Math.SQRT1_2]);
  track(dance, arm, "rotation", [0, 0, 0, 1, 0, 0, armTurn, Math.sqrt(1 - armTurn * armTurn)]);
  track(dance, eye, "scale", [1, 1, 1, 1, 0.1, 1]);
  const idle = doc.createAnimation("Idle");
  track(idle, eye, "scale", [1, 1, 1, 1, 0.2, 1]);
  return doc;
}

describe("Tanzdatei abtrennen (scripts/avatar-anim.mjs)", () => {
  it("Skelett-Spuren in die Tanzdatei (ohne Modell), Gesicht bleibt in der Figur; zusammen tanzt sie wie vorher", () => {
    const before = figure();
    const doc = figure();
    const shared = figure();
    expect(splitSharedClips(doc, shared)).toBe(2);
    const names = (d: Document) =>
      d
        .getRoot()
        .listAnimations()
        .map(
          (a) =>
            `${a.getName()}:${a
              .listChannels()
              .map((c) => c.getTargetNode()!.getName())
              .join("+")}`,
        );
    expect(names(shared)).toEqual(["Dance_A:Hips+LeftArm"]); // Idle hat keinen Skelett-Anteil → fällt dort weg
    expect(names(doc)).toEqual(["Dance_A:FaceEyeLeft", "Idle:FaceEyeLeft"]);
    expect(shared.getRoot().listMeshes()).toHaveLength(0);
    expect(doc.getRoot().listMeshes()).toHaveLength(1);
    const d = comparePoses(before, [shared, doc]);
    expect(d.rotationDeg).toBeLessThan(1e-4); // nur Float32-Rundung
    expect(d.scale).toBeLessThan(1e-6);
    // nur die Figur allein: Skelett stünde still → die Probe merkt das
    expect(comparePoses(before, doc).rotationDeg).toBeGreaterThan(40);
  });

  it("Fingerabdruck: gleiche Skelett-Tänze → gleiche Tanzdatei, schon kleine Unterschiede → eigene", () => {
    const sig = (d: Document) => sharedSignature(d, createHash);
    expect(sig(figure())).toBe(sig(figure()));
    expect(sig(figure())).not.toBe(sig(figure(0.7)));
    // Gesichtsspuren zählen nicht zum Fingerabdruck
    const other = figure();
    other.getRoot().listAnimations()[1]!.dispose();
    expect(sig(other)).toBe(sig(figure()));
  });
});
