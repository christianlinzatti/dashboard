import { expect, test } from "@playwright/test";
import { hideStage, ready } from "./helpers";

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
      await hideStage(page);
      await expect(page.getByTestId("lyrics")).toHaveScreenshot(`modus-${mode}.png`);
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

test.describe("Schrift-Effekte und Songstruktur", () => {
  test("Refrain bekommt einen auffälligen Effekt, die Strophe glüht nur", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=46000&buehne=festival");
    await ready(page);
    await expect(page.getByTestId("lyrics")).toHaveAttribute("data-effect", "feuer");
    await page.goto("/?demo=neonlicht&t=20000&buehne=festival");
    await ready(page);
    await expect(page.getByTestId("lyrics")).toHaveAttribute("data-effect", "gluehen");
  });

  for (const effect of ["neon", "echo", "glitch"] as const) {
    test(`Effekt ${effect}`, async ({ page }) => {
      await page.goto(`/?demo=neonlicht&t=46000&lyrics=karaoke&effekt=${effect}&buehne=synthwave`);
      await ready(page);
      await expect(page.getByTestId("lyrics")).toHaveAttribute("data-effect", effect);
      await expect(page.getByTestId("lyrics-current")).toHaveText("bis der Morgen uns zerbricht");
      await hideStage(page);
      await expect(page.getByTestId("lyrics")).toHaveScreenshot(`effekt-${effect}.png`);
    });
  }

  test("Fortschrittsleiste zeigt die Abschnitte des Songs, Refrains hervorgehoben", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=46000");
    await ready(page);
    const bar = page.getByTestId("structure");
    await expect(bar).toBeVisible();
    await expect(bar.locator("[data-kind=chorus]")).toHaveCount(3);
    await expect(bar.locator("[data-kind=bridge]")).toHaveCount(1);
    // ohne Lyrics keine Struktur
    await page.goto("/?demo=instrumental&t=46000");
    await ready(page);
    await expect(page.getByTestId("structure")).toHaveCount(0);
  });
});
