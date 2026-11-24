import { expect, test } from "@playwright/test";
import { hideStage, ready, tapControl } from "./helpers";

test.describe("Umschrift und Übersetzung", () => {
  test("japanischer Song: Umschrift automatisch, Umschalten auf Übersetzung und aus", async ({ page }) => {
    await page.goto("/?demo=hoshizora&t=10500&lyrics=karaoke");
    await ready(page);
    await expect(page.getByTestId("lyrics-current")).toContainText("夜空に");
    const second = page.getByTestId("lyrics-second");
    await expect(second).toHaveAttribute("data-kind", "umschrift");
    await expect(second).toHaveAttribute("lang", "ja-Latn");
    await expect(second).toHaveText("yozora ni hikaru hoshi no kakera");
    await hideStage(page);
    await expect(page.getByTestId("lyrics")).toHaveScreenshot("umschrift.png");

    const toggle = page.getByTestId("second-line-toggle");
    await tapControl(page, toggle);
    await expect(toggle).toHaveText("2. Zeile: Umschrift");
    await tapControl(page, toggle);
    await expect(toggle).toHaveText("2. Zeile: Übersetzung");
    await expect(second).toHaveAttribute("data-kind", "uebersetzung");
    await expect(second).toHaveText("Sternensplitter leuchten am Nachthimmel");
    await tapControl(page, toggle);
    await expect(toggle).toHaveText("2. Zeile: aus");
    await expect(second).toHaveCount(0);
    // Einstellung bleibt nach dem Neuladen erhalten
    await page.reload();
    await expect(page.getByTestId("lyrics-current")).toBeVisible();
    await expect(page.getByTestId("lyrics-second")).toHaveCount(0);
  });

  test("Songs ohne Umschrift: kein Schalter, keine zweite Zeile", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=46000&lyrics=karaoke");
    await ready(page);
    await expect(page.getByTestId("lyrics-second")).toHaveCount(0);
    await page.mouse.click(640, 300);
    await expect(page.getByTestId("strobe-toggle")).toBeVisible();
    await expect(page.getByTestId("second-line-toggle")).toHaveCount(0);
  });
});
