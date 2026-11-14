import { expect, test } from "@playwright/test";
import { collectErrors, ready } from "./helpers";

test.describe("Dashboard", () => {
  test("unbekannte Demo zeigt Hinweis", async ({ page }) => {
    await page.goto("/?demo=gibtsnicht");
    await expect(page.getByTestId("idle")).toContainText("„gibtsnicht“ gibt es nicht");
  });

  test("Feature-Song im Refrain mit Wort-Sync", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/?demo=neonlicht&t=46000&lyrics=karaoke");
    await ready(page);
    await expect(page.getByTestId("now-playing")).toContainText("Neonlicht");
    await expect(page.getByTestId("now-playing")).toContainText("Mira Sol feat. Kai Vento");
    await expect(page.getByTestId("lyrics-quality")).toHaveText("Wort-Sync");
    await expect(page.getByTestId("section")).toHaveText("Refrain");
    await expect(page.getByTestId("lyrics-current")).toHaveText("bis der Morgen uns zerbricht");
    await expect(page).toHaveScreenshot("feature-song-refrain.png");
    expect(errors).toEqual([]);
  });

  test("Feature-Song: Namensschilder für beide Artists, Solo-Song ohne", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=68500");
    await ready(page);
    await expect(page.getByTestId("name-tag")).toHaveText([/^Mira Sol/, /^Kai Vento/]);
    await page.goto("/?demo=abendrot&t=50000");
    await ready(page);
    await expect(page.getByTestId("name-tag")).toHaveCount(0);
  });

  test("Intro: Lead winkt, Choreografie startet", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=3000");
    await ready(page);
    await expect(page.getByTestId("section")).toHaveText("Intro");
    await expect(page).toHaveScreenshot("intro.png");
  });

  test("Feature-Song: zweiter Sänger in seiner Farbe", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=68500&lyrics=karaoke");
    await ready(page);
    await expect(page.getByTestId("section")).toHaveText("Strophe");
    await expect(page.getByTestId("lyrics-current")).toHaveText("wir drehen auf, wir geben Gas");
    await expect(page).toHaveScreenshot("feature-song-zweiter-saenger.png");
  });

  test("Instrumental-Pause zwischen Zeilen", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=36800");
    await ready(page);
    await expect(page.getByTestId("lyrics-gap")).toBeVisible();
    await expect(page).toHaveScreenshot("pause-zwischen-zeilen.png");
  });

  test("Zeilen-Sync", async ({ page }) => {
    await page.goto("/?demo=abendrot&t=50000");
    await ready(page);
    await expect(page.getByTestId("lyrics-quality")).toHaveText("Zeilen-Sync");
    await expect(page.getByTestId("lyrics-current")).toHaveText("über's Wasser, Schritt für Schritt");
    await expect(page).toHaveScreenshot("zeilen-sync.png");
  });

  test("Song ohne Lyrics", async ({ page }) => {
    await page.goto("/?demo=instrumental&t=30000");
    await ready(page);
    await expect(page.getByTestId("lyrics-none")).toContainText("keine Lyrics");
    await expect(page.getByTestId("lyrics-quality")).toHaveText("Keine Lyrics");
    await expect(page).toHaveScreenshot("ohne-lyrics.png");
  });

  test("Debug-Panel zeigt den Song-Kontext", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=46000&debug=1");
    await ready(page);
    const panel = page.getByTestId("debug-panel");
    await expect(panel).toContainText("Song-Kontext");
    await expect(panel).toContainText('"isChorus": true');
    await expect(panel).toContainText('"activeSingerId": "demo-mira"');
  });

  test("laufende Wiedergabe bewegt den Fortschritt", async ({ page }) => {
    await page.goto("/?demo=neonlicht");
    // Sekunden aus „m:ss“ lesen – robust gegen langsame Rechner, die Anzeigen überspringen
    const seconds = async () => {
      const m = (await page.getByTestId("progress").innerText()).match(/(\d+):(\d\d)/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
    };
    await expect.poll(seconds).toBeGreaterThanOrEqual(0);
    await expect.poll(seconds, { timeout: 8_000 }).toBeGreaterThanOrEqual(2);
  });

  test("Sicherheits-Header sind gesetzt", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["permissions-policy"]).toContain("microphone=(self)");
    expect(h["x-frame-options"]).toBe("DENY");
  });
});
