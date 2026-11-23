import { describe, expect, it } from "vitest";
// @ts-expect-error – Bauskript ohne Typen (scripts/avatars)
import { Builder, byHeight } from "../../scripts/avatars/geometry.mjs";
import manifest from "@/avatars/manifest.json";

type Part = { positions: number[]; indices: number[]; skins: Array<Array<[string, number]>> };

/** Anteil der Dreiecke, deren Vorderseite (gegen den Uhrzeigersinn) von `inside(p)` weg zeigt */
function outward(part: Part, inside: (p: number[]) => number[]) {
  const P = (i: number) => part.positions.slice(i * 3, i * 3 + 3);
  let out = 0;
  const n = part.indices.length / 3;
  for (let i = 0; i < part.indices.length; i += 3) {
    const [a, b, c] = [P(part.indices[i]!), P(part.indices[i + 1]!), P(part.indices[i + 2]!)];
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const nrm = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const m = [0, 1, 2].map((k) => (a[k]! + b[k]! + c[k]!) / 3);
    const o = inside(m);
    if (nrm[0]! * (m[0]! - o[0]!) + nrm[1]! * (m[1]! - o[1]!) + nrm[2]! * (m[2]! - o[2]!) >= 0) out++;
  }
  return out / n;
}

describe("Avatar-Bausteine (scripts/avatars)", () => {
  // Falsch herum orientierte Dreiecke rendern die Formen „von innen“: Haare schieben sich vors Gesicht
  it("Formen zeigen ihre Vorderseite nach außen (glTF: gegen den Uhrzeigersinn)", () => {
    const b = new Builder();
    b.blob("kugel", [0, 0.7, 0], [0.16, 0.18, 0.16], "Head", { seg: 24 });
    b.blob("kasten", [0, 0, 0], [0.2, 0.1, 0.15], "Hips", { exp: 0.25 });
    b.tube(
      "roehre",
      [
        [0, 0, 0],
        [0.4, 0, 0],
      ],
      [0.05, 0.02],
      "Arm",
      { caps: false },
    );
    b.limb("glied", [0.26, 0.44, 0], [0.36, 0.12, 0], 0.07, 0.06, "LeftArm", "LeftForeArm", { caps: false });
    expect(outward(b.parts.get("kugel"), () => [0, 0.7, 0])).toBe(1);
    expect(outward(b.parts.get("kasten"), () => [0, 0, 0])).toBe(1);
    expect(outward(b.parts.get("roehre"), (m) => [m[0]!, 0, 0])).toBe(1);
    expect(outward(b.parts.get("glied"), (m) => [0.26 + (0.1 * (0.44 - m[1]!)) / 0.32, m[1]!, 0])).toBe(1);
  });

  it("Glieder gehen am Ende weich in den nächsten Knochen über, Rumpf nach der Höhe", () => {
    const b = new Builder();
    b.limb("glied", [0, 0, 0], [0, -0.4, 0], 0.05, 0.05, "A", "B", { caps: false });
    const skins = (b.parts.get("glied") as Part).skins;
    expect(skins[0]).toEqual([["A", 1]]);
    const last = skins.at(-1)!;
    expect(last.map(([bone]) => bone)).toEqual(["A", "B"]);
    expect(last[1]![1]).toBeCloseTo(0.5);
    const w = byHeight([
      [0, "Hips"],
      [0.2, "Spine"],
    ]);
    expect(w([0, -0.1, 0])).toEqual([["Hips", 1]]);
    expect(w([0, 0.1, 0]).map(([, x]: [string, number]) => x)).toEqual([0.5, 0.5]);
  });

  it("erzeugte Figuren stehen mit Version und Grundmodell im Manifest", () => {
    const generated = manifest.filter((m) => "generated" in m && m.generated) as Array<{
      base: string;
      version: string;
      file: string;
    }>;
    expect(generated.length).toBeGreaterThanOrEqual(17);
    const bases = new Set(manifest.filter((m) => !("generated" in m)).map((m) => m.file.replace(/\.glb$/, "")));
    for (const g of generated) {
      expect(g.version, g.file).toMatch(/^[0-9a-f]{16}$/);
      expect(bases.has(g.base), g.file).toBe(true);
    }
  });
});

describe("Kompakter Avatar-Katalog", () => {
  it("lib/avatars/catalog.json passt zum Manifest (sonst: node scripts/avatar-catalog.mjs)", async () => {
    // @ts-expect-error – Bauskript ohne Typen
    const { compactCatalog } = await import("../../scripts/avatar-catalog.mjs");
    const catalog = (await import("@/lib/avatars/catalog.json")).default;
    expect(compactCatalog(manifest)).toEqual(catalog);
  });

  it("Client-Katalog: jede ID mit Version und Clips, gleiche Clip-Listen nur einmal", async () => {
    const { avatars } = await import("@/lib/avatars/catalog");
    const catalog = (await import("@/lib/avatars/catalog.json")).default;
    expect(avatars).toHaveLength(manifest.length);
    for (const a of avatars) {
      expect(a.url, a.id).toMatch(/^\/avatars\/[a-z0-9-]+\.glb\?v=[0-9a-f]{12}$/);
      expect(a.clips.length, a.id).toBeGreaterThan(0);
    }
    expect(catalog.clipSets.length).toBeLessThan(avatars.length / 3);
  });
});
