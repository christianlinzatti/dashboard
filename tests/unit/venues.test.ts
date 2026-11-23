import { describe, expect, it } from "vitest";
import { Group, Mesh, Vector3 } from "three";
import { mat } from "@/components/stage/venues/shared";

describe("Kulissen: Instancing-Matrizen", () => {
  it("verschachtelte Stufen ergeben dieselbe Lage wie <group> → <group> → <mesh>", () => {
    const outer = new Group();
    outer.position.set(3, -0.25, 2);
    outer.rotation.set(0, 0.7, 0);
    const inner = new Group();
    inner.position.set(0.4, 5, 0);
    const mesh = new Mesh();
    mesh.position.set(0.9, -0.2, 0);
    mesh.rotation.set(0.1, 0, -0.3);
    mesh.scale.set(1, 2, 0.5);
    outer.add(inner);
    inner.add(mesh);
    outer.updateMatrixWorld(true);

    const m = mat(
      { p: [3, -0.25, 2], r: [0, 0.7, 0] },
      { p: [0.4, 5, 0] },
      { p: [0.9, -0.2, 0], r: [0.1, 0, -0.3], s: [1, 2, 0.5] },
    );
    for (const v of [new Vector3(0, 0, 0), new Vector3(1, 1, 1), new Vector3(-0.5, 2, 0.3)]) {
      const a = v.clone().applyMatrix4(m);
      const b = v.clone().applyMatrix4(mesh.matrixWorld);
      expect(a.distanceTo(b)).toBeLessThan(1e-9);
    }
  });

  it("ohne Angaben: Einheitsmatrix", () => {
    expect(mat().equals(mat({}))).toBe(true);
    expect(mat({}).elements).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
});
