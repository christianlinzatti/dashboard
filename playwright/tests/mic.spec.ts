import { expect, test, type Page } from "@playwright/test";
import { debugContext } from "./helpers";

test.use({ permissions: ["microphone"] });

type Ctx = { live: { micActive: boolean; micState: string; energy: number; bands: number[] } };
const context = (page: Page) => debugContext<Ctx>(page);

test("Mikrofon lässt sich einschalten und liefert Messwerte", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // geprüft wird das Mikrofon, nicht die Bühne: leichteste Bühne auf niedriger Qualität, sonst bremst die laufende
  // 3D-Szene (ohne GPU, große Auflösung) die Seite so aus, dass das Debug-Panel den Zustand erst nach vielen Sekunden zeigt
  await page.goto("/?demo=neonlicht&mic=1&debug=1&qualitaet=niedrig&buehne=jazz");
  await expect(page.getByTestId("now-playing")).toBeVisible();

  // Berechtigung ist erteilt → Mikro startet automatisch
  const indicator = page.getByTestId("mic-indicator");
  await expect.poll(async () => (await context(page)).live.micState, { timeout: 20_000 }).toBe("aktiv");
  await expect(indicator).toBeVisible();
  await expect.poll(async () => (await context(page)).live.bands.length, { timeout: 10_000 }).toBe(6);
  await expect(page.getByTestId("bpm")).toContainText("BPM");

  // Ausschalten über die Steuerleiste
  await page.mouse.click(640, 300);
  await expect(page.getByTestId("mic-toggle")).toHaveText("Mikro aus");
  await page.getByTestId("mic-toggle").dispatchEvent("click");
  await expect(indicator).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Demos ohne ?mic=1 nutzen kein Mikrofon (reproduzierbare Screenshots)", async ({ page }) => {
  await page.goto("/?demo=neonlicht&t=46000");
  await expect(page.getByTestId("now-playing")).toBeVisible();
  await page.mouse.click(640, 300);
  await expect(page.getByTestId("mic-toggle")).toHaveCount(0);
  await expect(page.getByTestId("mic-indicator")).toHaveCount(0);
});
