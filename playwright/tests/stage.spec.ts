import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.locator("body[data-stage-ready=true]").waitFor({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

test.describe("Bühne & Licht", () => {
  for (const q of ["niedrig", "mittel", "hoch"] as const) {
    test(`Qualitätsstufe ${q}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/?demo=neonlicht&t=46000&lyrics=karaoke&qualitaet=${q}`);
      await ready(page);
      await expect(page.locator(`[data-quality=${q}]`)).toBeVisible();
      await expect(page).toHaveScreenshot(`buehne-${q}.png`);
      expect(errors).toEqual([]);
    });
  }

  test("Qualität und Strobe lassen sich umschalten und bleiben gespeichert", async ({ page }) => {
    await page.goto("/?demo=neonlicht");
    await expect(page.getByTestId("now-playing")).toBeVisible();
    await page.mouse.click(640, 300);
    await expect(page.getByTestId("quality-toggle")).toHaveText("Qualität: Auto");
    await page.getByTestId("quality-toggle").click();
    await expect(page.getByTestId("quality-toggle")).toHaveText("Qualität: Niedrig");
    await expect(page.locator("[data-quality=niedrig]")).toBeVisible();
    await page.getByTestId("strobe-toggle").click();
    await expect(page.getByTestId("strobe-toggle")).toHaveText("Strobo aus");

    await page.reload();
    await expect(page.locator("[data-quality=niedrig]")).toBeVisible();
    await page.mouse.click(640, 300);
    await expect(page.getByTestId("strobe-toggle")).toHaveText("Strobo aus");
  });
});
