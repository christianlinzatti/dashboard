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

  test("Intro: die Crew läuft von der Seite ein", async ({ page }) => {
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

  test("Debug-Panel: scrollen, anhalten, kopieren, als Datei speichern", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/?demo=neonlicht&t=46000&debug=1&qualitaet=niedrig");
    await ready(page);
    const panel = page.getByTestId("debug-panel");
    await expect(panel).toContainText("Song-Kontext");
    // scrollbar (fängt Mausrad und Berührung selbst ab)
    await panel.hover();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    // anhalten: Inhalt bleibt stehen, damit eine Markierung hält
    await page.getByTestId("debug-pause").click();
    await expect(panel).toHaveAttribute("data-paused", "true");
    const frozen = await panel.locator("pre").innerText();
    await page.waitForTimeout(800);
    expect(await panel.locator("pre").innerText()).toBe(frozen);
    // kopieren: vollständig (mit allen Lyrics-Zeilen)
    await page.getByTestId("debug-copy").click();
    await expect(page.getByRole("status")).toContainText("Kopiert");
    const copied = JSON.parse(await page.evaluate(() => navigator.clipboard.readText())) as {
      song: { trackKey: string; lyrics: { lines: unknown[] } };
    };
    expect(copied.song.trackKey).toBeTruthy();
    expect(Array.isArray(copied.song.lyrics.lines)).toBe(true);
    // als Datei
    const download = page.waitForEvent("download");
    await page.getByTestId("debug-download").click();
    expect((await download).suggestedFilename()).toMatch(/^song-kontext-.+\.json$/);
  });

  test("Debug: Song-Kontext an den Server senden und auf einem anderen Gerät ansehen", async ({ page, browser }) => {
    // Demo ist nicht angemeldet: der Server antwortet ehrlich mit 401
    await page.goto("/?demo=neonlicht&t=46000&debug=1&qualitaet=niedrig");
    await ready(page);
    await page.getByTestId("debug-send").click();
    await expect(page.getByRole("status")).toContainText("Nicht angemeldet");
    // angemeldet (nachgebildet): der gesendete Kontext kommt an
    let sent: { context: { song: { trackKey: string } } } | null = null;
    await page.route("**/api/debug-context", async (r) => {
      sent = JSON.parse(r.request().postData() ?? "null");
      await r.fulfill({ json: { ok: true } });
    });
    await page.getByTestId("debug-send").click();
    await expect(page.getByRole("status")).toContainText("An Server gesendet");
    expect(sent!.context.song.trackKey).toBe("demo-neonlicht");

    // zweites Gerät: /debug zeigt, was gesendet wurde
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.route("**/api/debug-context", (r) =>
      r.fulfill({ json: { entry: { ...sent!, sentAt: Date.now(), receivedAt: Date.now(), device: "1280×800" } } }),
    );
    await phone.route("**/api/log", (r) => r.fulfill({ json: { entries: [] } }));
    await phone.goto("/debug");
    await expect(phone.getByTestId("viewer-sections")).toContainText("demo-neonlicht");
    await expect(phone.getByTestId("viewer-age")).toContainText("gesendet vor");
    // ohne Anmeldung: Hinweis mit Anmelde-Link
    await phone.unroute("**/api/debug-context");
    await phone.reload();
    await expect(phone.getByTestId("viewer-login")).toContainText("Mit Spotify anmelden");
    await phone.close();
  });

  test("laufende Wiedergabe bewegt den Fortschritt", async ({ page }) => {
    // geprüft wird die Zeitanzeige, nicht die Bühne: niedrige Qualität, damit langsame CI-Rechner (ohne GPU) mithalten
    await page.goto("/?demo=neonlicht&qualitaet=niedrig");
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
