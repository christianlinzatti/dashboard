import { expect, test } from "@playwright/test";

test.use({ permissions: ["microphone"] });

/** Liest den Song-Kontext aus dem Debug-Panel. */
async function context(page: import("@playwright/test").Page) {
  return JSON.parse(await page.getByTestId("debug-panel").locator("pre").innerText()) as {
    live: { micActive: boolean; micState: string; energy: number; bands: number[] };
  };
}

test("Mikrofon lässt sich einschalten und liefert Messwerte", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?demo=neonlicht&mic=1&debug=1");
  await expect(page.getByTestId("now-playing")).toBeVisible();

  // Berechtigung ist erteilt → Mikro startet automatisch
  const indicator = page.getByTestId("mic-indicator");
  await expect.poll(async () => (await context(page)).live.micState, { timeout: 10_000 }).toBe("aktiv");
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
