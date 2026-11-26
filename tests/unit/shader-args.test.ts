import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sameParams } from "@/components/stage/shader-args";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

describe("stabile Shader-Argumente", () => {
  it("gleich, wenn Shader-Text und Uniforms gleich sind", () => {
    const uniforms = { uTime: { value: 0 } };
    const v = (n: number) => `void main() { gl_Position = vec4(${n}); }`;
    expect(sameParams({ vertexShader: v(1), uniforms }, { vertexShader: v(1), uniforms })).toBe(true);
    expect(sameParams({ vertexShader: v(1), uniforms }, { vertexShader: v(2), uniforms })).toBe(false);
    expect(sameParams({ uniforms }, { uniforms: { uTime: { value: 0 } } })).toBe(false); // neues Objekt
    expect(sameParams({ uniforms }, { uniforms, fog: true })).toBe(false);
  });

  it("kein Objekt-Literal in `args` von Materialien (R3F baute sie sonst bei jedem Rendern neu)", () => {
    const hits = files(path.join(process.cwd(), "components")).flatMap((f) => {
      const text = readFileSync(f, "utf8");
      // auch über Zeilen hinweg: args={[ ⏎ { … }
      return [...text.matchAll(/args=\{\[\s*\{/g)].map(
        (m) => `${path.relative(process.cwd(), f)}:${text.slice(0, m.index).split("\n").length}`,
      );
    });
    expect(hits).toEqual([]);
  });
});
