import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Wartet, bis die 3D-Szene gerendert, die Schriften geladen und die Lyrics eingeblendet sind (Einblenden dauert
 * 0,45 s – ein Screenshot mittendrin zeigt die Zeile halb durchsichtig und ohne Karaoke-Farben).
 */
export async function ready(page: Page, withStage = true) {
  if (withStage) {
    try {
      await page.locator("body[data-stage-ready=true]").waitFor({ timeout: 60_000 });
    } catch (e) {
      throw new Error(`Bühne nicht fertig: ${(e as Error).message}\n${await stageDiagnosis(page)}`);
    }
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() =>
    [...document.querySelectorAll("[data-testid=lyrics]")].every((el) =>
      el.getAnimations().every((a) => a.playState === "finished" || a.effect?.getTiming().iterations === Infinity),
    ),
  );
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

/**
 * Was die Seite gerade tut, wenn die Bühne nicht fertig wird: Zustand der Seite, Konsole, Fehler, laufende
 * Anfragen. Ohne das bleibt ein Timeout auf dem CI-Rechner (Software-Rendering) ein Rätsel.
 */
export async function stageDiagnosis(page: Page): Promise<string> {
  const state = await page
    .evaluate(() => {
      const canvas = document.querySelector("[data-testid=stage] canvas") as HTMLCanvasElement | null;
      const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
      const pending = performance
        .getEntriesByType("resource")
        .filter((r) => (r as PerformanceResourceTiming).responseEnd === 0)
        .map((r) => r.name);
      return {
        url: location.href,
        body: Object.fromEntries([...document.body.attributes].map((a) => [a.name, a.value])),
        stage: Object.fromEntries(
          [...(document.querySelector("[data-testid=stage]")?.attributes ?? [])].map((a) => [a.name, a.value]),
        ),
        canvas: canvas ? `${canvas.width}×${canvas.height}` : "keins",
        webglVerloren: gl ? gl.isContextLost() : "kein Kontext",
        offeneAnfragen: pending.slice(-10),
        sekunden: Math.round(performance.now() / 1000),
      };
    })
    .catch((e: Error) => ({ fehler: e.message }));
  const lines = (await page.consoleMessages().catch(() => [])).slice(-25).map((m) => `  [${m.type()}] ${m.text().slice(0, 300)}`);
  const errors = (await page.pageErrors().catch(() => [])).map((e) => `  ${e.message.slice(0, 300)}`);
  return [
    `Zustand: ${JSON.stringify(state)}`,
    `Konsole (letzte 25):\n${lines.join("\n") || "  –"}`,
    `Seitenfehler:\n${errors.join("\n") || "  –"}`,
  ].join("\n");
}

/**
 * Für Screenshots von Karten und Lyrics: die 3D-Bühne ausblenden – dann ändern Umbauten an der Bühne diese
 * Referenzbilder nicht mehr (dahinter bleibt der schlichte dunkle Hintergrund).
 */
export async function hideStage(page: Page) {
  await page.addStyleTag({ content: "[data-testid=stage] canvas { visibility: hidden !important; }" });
}
