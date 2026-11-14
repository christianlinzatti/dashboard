import { expect, type Locator, type Page } from "@playwright/test";

/** Wartet, bis die 3D-Szene gerendert und die Schriften geladen sind. */
export async function ready(page: Page, withStage = true) {
  if (withStage) await page.locator("body[data-stage-ready=true]").waitFor({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** Sammelt Laufzeitfehler der Seite (zum Prüfen am Testende). */
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

/**
 * Steuerleiste einblenden und sofort bedienen. Die Leiste blendet sich nach 6 s aus –
 * auf langsamen CI-Runnern (Software-Rendering) kann das zwischen zwei Testschritten passieren.
 */
export async function tapControl(page: Page, control: Locator) {
  await page.mouse.click(640, 300);
  await expect(page.getByTestId("controls")).toHaveCSS("opacity", "1");
  await control.dispatchEvent("click");
}

/** Liest den Song-Kontext aus dem Debug-Panel (?debug=1). */
export async function debugContext<T = Record<string, unknown>>(page: Page): Promise<T> {
  return JSON.parse(await page.getByTestId("debug-panel").locator("pre").innerText()) as T;
}
