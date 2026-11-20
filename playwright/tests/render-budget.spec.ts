import { expect, test } from "@playwright/test";
import budget from "./render-budget.json" with { type: "json" };
import { ready } from "./helpers";

/**
 * Leistungswächter: Zeichenaufrufe und Dreiecke je Bild für jede Bühne auf den Stufen „niedrig“ und „mittel“ (die
 * für den Pi in Frage kommen). Anders als die Bildrate sind die Werte auch ohne GPU in der CI stabil – und genau
 * das, was einen Raspberry Pi bremst. Grenzen: playwright/tests/render-budget.json.
 */
const entries = Object.entries(budget.budgets) as Array<[string, { drawcalls: number; triangles: number }]>;

test.describe("Leistungswächter", () => {
  // die Kosten hängen kaum an der Auflösung – eine reicht
  test.beforeEach(({}, info) => test.skip(info.project.name !== "1280x800", "nur einmal je Lauf"));

  for (const [key, max] of entries) {
    const [theme, quality] = key.split("/");
    test(`Bühne ${theme}, Qualität ${quality}: im Budget`, async ({ page }) => {
      await page.goto(`/?demo=neonlicht&t=46000&buehne=${theme}&qualitaet=${quality}`);
      await ready(page);
      const canvas = page.locator("[data-testid=stage] canvas");
      await expect(canvas).toHaveAttribute("data-drawcalls", /\d+/);
      const [calls, triangles] = await canvas.evaluate((c: HTMLCanvasElement) => [
        Number(c.dataset.drawcalls),
        Number(c.dataset.triangles),
      ]);
      test.info().annotations.push({ type: "kosten", description: `${calls} Zeichenaufrufe, ${triangles} Dreiecke` });
      expect(calls, `Zeichenaufrufe ${theme}/${quality} (Budget ${max.drawcalls})`).toBeLessThanOrEqual(max.drawcalls);
      expect(triangles, `Dreiecke ${theme}/${quality} (Budget ${max.triangles})`).toBeLessThanOrEqual(max.triangles);
    });
  }
});
