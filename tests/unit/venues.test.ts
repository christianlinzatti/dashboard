import { describe, expect, it } from "vitest";
import { Group, Mesh, Vector3 } from "three";
import { mat } from "@/components/stage/instances";

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

describe("Komponenten: eindeutige Schlüssel unter Geschwistern", () => {
  // Zwei Geschwister mit demselben key (früher Publikum und Effekte, beide key={theme.id}) lassen React in Produktion
  // bei jedem Neu-Rendern eine weitere Kopie anlegen, ohne die alte abzubauen – das Publikum lag zuletzt achtfach in
  // der Szene und kostete jedes Mal Zeichenaufrufe. In Entwicklung gibt es dazu nur eine Warnung in der Konsole.
  it("kein JSX-Element hat zwei Kinder mit demselben key-Ausdruck", async () => {
    const ts = await import("typescript");
    const { readFile, readdir } = await import("node:fs/promises");
    const files = (await readdir("components", { recursive: true })).filter((f) => f.endsWith(".tsx"));
    const problems: string[] = [];

    /** JSX-Elemente eines Kind-Platzes (auch hinter && und in den Zweigen von ?:, nicht in .map-Rückrufen) */
    const jsxOf = (n: import("typescript").Node, out: import("typescript").Node[]) => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) out.push(n);
      else if (ts.isJsxExpression(n) && n.expression) jsxOf(n.expression, out);
      else if (ts.isParenthesizedExpression(n)) jsxOf(n.expression, out);
      else if (ts.isBinaryExpression(n)) jsxOf(n.right, out);
      else if (ts.isConditionalExpression(n)) (jsxOf(n.whenTrue, out), jsxOf(n.whenFalse, out));
      return out;
    };
    const keyOf = (el: import("typescript").Node, sf: import("typescript").SourceFile) => {
      const attrs = ts.isJsxElement(el)
        ? el.openingElement.attributes
        : (el as import("typescript").JsxSelfClosingElement).attributes;
      const k = attrs.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "key");
      return k && ts.isJsxAttribute(k) && k.initializer ? k.initializer.getText(sf) : null;
    };

    for (const file of files) {
      const path = `components/${file}`;
      const sf = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (n: import("typescript").Node) => {
        if (ts.isJsxElement(n) || ts.isJsxFragment(n)) {
          // je Kind-Platz die möglichen keys (Zweige von ?: schließen sich aus und dürfen sich einen key teilen)
          const slots = n.children.map(
            (c) =>
              new Set(
                jsxOf(c, [])
                  .map((k) => keyOf(k, sf))
                  .filter((k): k is string => !!k),
              ),
          );
          const count = new Map<string, number>();
          for (const slot of slots) for (const k of slot) count.set(k, (count.get(k) ?? 0) + 1);
          for (const [k, c] of count) if (c > 1) problems.push(`${path}: key=${k} mehrfach unter einem Element`);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(problems).toEqual([]);
    expect(files.length).toBeGreaterThan(20);
  });
});
