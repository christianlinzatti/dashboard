import { expect, test } from "@playwright/test";
import { ready, tapControl } from "./helpers";

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

  // Jede Bühne mit typischem Effekt (Songzeit fest → Partikel deterministisch)
  const themes = [
    { theme: "festival", q: "demo=neonlicht&t=41000&lyrics=karaoke", fx: "pyro" },
    { theme: "festival-finale", q: "demo=neonlicht&t=129000&lyrics=karaoke&buehne=festival", fx: "konfetti" },
    { theme: "club", q: "demo=instrumental&t=44200", fx: "co2" },
    { theme: "synthwave", q: "demo=hoshizora&t=31000", fx: "ringe" },
    { theme: "jazz", q: "demo=abendrot&t=44000", fx: "glitzer" },
    { theme: "weltraum", q: "demo=neonlicht&t=5000&buehne=weltraum", fx: "sternschnuppen" },
  ] as const;
  for (const { theme, q, fx } of themes) {
    test(`Bühne ${theme}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/?${q}&qualitaet=hoch`);
      await ready(page);
      await expect(page.locator(`[data-theme=${theme.split("-")[0]}]`)).toBeVisible();
      await expect(page.locator(`[data-testid=stage] canvas[data-fx*=${fx}]`)).toHaveCount(1);
      await expect(page).toHaveScreenshot(`buehne-${theme}.png`);
      expect(errors).toEqual([]);
    });
  }

  // Kamera-Einstellungen und Drehbühne (aus dem Plan des Demo-Songs)
  const shots = [
    { name: "kamera-nah", q: "demo=neonlicht&t=20000&lyrics=karaoke", camera: "nah" },
    { name: "kamera-kreisfahrt", q: "demo=neonlicht&t=98000&lyrics=karaoke", camera: "kreisfahrt" },
    { name: "drehbuehne", q: "demo=abendrot&t=50000", camera: "untersicht+drehbuehne" },
  ] as const;
  for (const { name, q, camera } of shots) {
    test(`Kamera ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/?${q}&qualitaet=hoch`);
      await ready(page);
      await expect(page.locator("[data-testid=stage] canvas")).toHaveAttribute("data-camera", camera);
      await expect(page).toHaveScreenshot(`${name}.png`);
      expect(errors).toEqual([]);
    });
  }

  test("Bühne lässt sich umschalten und bleibt gespeichert", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=46000");
    await expect(page.locator("[data-theme=festival]")).toBeVisible();
    await page.mouse.click(640, 300);
    const toggle = page.getByTestId("stage-toggle");
    await expect(toggle).toHaveText("Bühne: Auto");
    await tapControl(page, toggle);
    await expect(toggle).toHaveText("Bühne: Club");
    await expect(page.locator("[data-theme=club]")).toBeVisible();
    await page.reload();
    await expect(page.locator("[data-theme=club]")).toBeVisible();
  });

  test("Qualität und Strobe lassen sich umschalten und bleiben gespeichert", async ({ page }) => {
    await page.goto("/?demo=neonlicht");
    await expect(page.getByTestId("now-playing")).toBeVisible();
    const tap = (id: string) => tapControl(page, page.getByTestId(id));
    await page.mouse.click(640, 300);
    await expect(page.getByTestId("quality-toggle")).toHaveText("Qualität: Auto");
    await tap("quality-toggle");
    await expect(page.getByTestId("quality-toggle")).toHaveText("Qualität: Niedrig");
    await expect(page.locator("[data-quality=niedrig]")).toBeVisible();
    await tap("strobe-toggle");
    await expect(page.getByTestId("strobe-toggle")).toHaveText("Strobo aus");

    await page.reload();
    await expect(page.locator("[data-quality=niedrig]")).toBeVisible();
    await page.mouse.click(640, 300);
    await expect(page.getByTestId("strobe-toggle")).toHaveText("Strobo aus");
  });
});

test.describe("Robustheit der Bühne", () => {
  test("ohne WebGL: 2D-Hintergrund statt Absturz, Lyrics laufen weiter", async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      // WebGL nicht verfügbar (z. B. Grafiktreiber-Problem auf dem Pi)
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type.startsWith("webgl")) return null;
        return (orig as (...a: unknown[]) => RenderingContext | null).call(this, type, ...args);
      } as typeof orig;
    });
    await page.goto("/?demo=neonlicht&t=46000&lyrics=karaoke");
    await expect(page.getByTestId("stage-fallback")).toBeVisible();
    await expect(page.getByTestId("lyrics-current")).toHaveText("bis der Morgen uns zerbricht");
  });

  test("ein Avatar lädt nicht: die anderen tanzen weiter", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/avatars/atlas-prism.glb?*", (route) => route.abort());
    await page.goto("/?demo=neonlicht&t=46000&lyrics=karaoke");
    await ready(page);
    await expect(page.getByTestId("stage")).toBeVisible();
    await expect(page.getByTestId("stage-fallback")).toHaveCount(0);
    // Namensschild des fehlenden Avatars (Kai Vento) fehlt, das der anderen ist da
    await expect(page.getByTestId("name-tag")).toHaveText([/^Mira Sol/]);
    // nur der absichtlich provozierte Ladefehler, sonst nichts
    expect(errors.filter((e) => !/Could not load \/avatars\/atlas-prism\.glb/.test(e))).toEqual([]);
  });
});
