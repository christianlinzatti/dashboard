import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.locator("body[data-stage-ready=true]").waitFor({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

test.describe("LyricsDirector wählt passend zum Abschnitt", () => {
  for (const [t, section, modes] of [
    [46_000, "Refrain", ["stapel", "wortpop"]],
    [68_500, "Strophe", ["duett"]],
    [112_000, "Bridge", ["schreibmaschine"]],
  ] as const) {
    test(`${section} (${t / 1000} s)`, async ({ page }) => {
      await page.goto(`/?demo=neonlicht&t=${t}`);
      await ready(page);
      await expect(page.getByTestId("section")).toHaveText(section);
      expect(modes).toContain(await page.getByTestId("lyrics").getAttribute("data-mode"));
    });
  }
});

test.describe("Darstellungsmodi", () => {
  for (const [mode, t] of [
    ["karaoke", 46_000],
    ["wortpop", 46_000],
    ["stapel", 46_000],
    ["schreibmaschine", 46_000],
    ["duett", 68_500],
  ] as const) {
    test(mode, async ({ page }) => {
      await page.goto(`/?demo=neonlicht&t=${t}&lyrics=${mode}`);
      await ready(page);
      await expect(page.getByTestId("lyrics")).toHaveAttribute("data-mode", mode);
      await expect(page.getByTestId("lyrics-current").first()).toBeVisible();
      await expect(page).toHaveScreenshot(`modus-${mode}.png`);
    });
  }

  test("Duett zeigt beide Sänger, der aktive in seiner Farbe", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=68500&lyrics=duett");
    await ready(page);
    const duet = page.getByTestId("lyrics-duet");
    await expect(duet).toContainText("Mira Sol");
    await expect(duet).toContainText("Kai Vento");
    await expect(duet.getByTestId("lyrics-current")).toHaveText("wir drehen auf, wir geben Gas");
  });
});
