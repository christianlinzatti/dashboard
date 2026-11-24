import { expect, test } from "@playwright/test";
import { collectErrors, ready, tapControl } from "./helpers";

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
    // KI-Mitschrift (angemeldet nachgebildet): komplette Frage und Antwort im Panel
    await page.route("**/api/show/trace**", (r) =>
      r.fulfill({
        json: {
          ai: { provider: "openai", model: "gpt-5.4-mini" },
          trace: {
            provider: "openai",
            model: "gpt-5.4-mini",
            at: Date.now(),
            ms: 2100,
            system: "Du bist die Show-Regie von „Sonic Stage“.",
            user: "Titel: Neonlicht\nKünstler: Mira Sol",
            response: '{"stage":"club","motto":"Neonnacht"}',
            usage: { input: 1800, output: 240 },
            outcome: "ok",
          },
        },
      }),
    );
    // Demo ist nicht angemeldet: der Server antwortet ehrlich mit 401
    await page.goto("/?demo=neonlicht&t=46000&debug=1&qualitaet=niedrig");
    await ready(page);
    const ai = page.getByTestId("ai-trace");
    await expect(ai).toContainText("gpt-5.4-mini");
    await expect(ai).toContainText("Titel: Neonlicht");
    await expect(ai).toContainText('"motto": "Neonnacht"');
    await page.getByTestId("debug-send").click();
    await expect(page.getByRole("status")).toContainText("Nicht angemeldet");
    // angemeldet (nachgebildet): der gesendete Kontext kommt an
    let sent: { context: { song: { trackKey: string }; ki?: { trace: { user: string } } } } | null = null;
    await page.route("**/api/debug-context", async (r) => {
      sent = JSON.parse(r.request().postData() ?? "null");
      await r.fulfill({ json: { ok: true } });
    });
    await page.getByTestId("debug-send").click();
    await expect(page.getByRole("status")).toContainText("An Server gesendet");
    expect(sent!.context.song.trackKey).toBe("demo-neonlicht");
    expect(sent!.context.ki?.trace.user).toContain("Titel: Neonlicht");

    // zweites Gerät: /debug zeigt, was gesendet wurde
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await phone.route("**/api/debug-context", (r) =>
      r.fulfill({ json: { entry: { ...sent!, sentAt: Date.now(), receivedAt: Date.now(), device: "1280×800" } } }),
    );
    await phone.route("**/api/log", (r) => r.fulfill({ json: { entries: [] } }));
    // Lyrics-Provider-Status: spotify-color pausiert mit Grund
    await phone.route("**/api/lyrics-status", (r) =>
      r.fulfill({
        json: {
          now: Date.now(),
          providers: [
            {
              id: "spotify-color",
              configured: true,
              paused: true,
              pausedUntil: Date.now() + 12 * 60_000,
              reason: "TOTP oder sp_dc abgelehnt (HTTP 400)",
            },
            { id: "spotify-canvas", configured: true, paused: false },
          ],
        },
      }),
    );
    await phone.goto("/debug");
    const status = phone.getByTestId("lyrics-status-spotify-color");
    await expect(status.getByText("pausiert")).toBeVisible();
    await expect(status).toContainText("TOTP oder sp_dc abgelehnt");
    await expect(phone.getByTestId("lyrics-status-spotify-canvas").getByText("läuft")).toBeVisible();
    await expect(phone.getByTestId("viewer-sections")).toContainText("demo-neonlicht");
    await expect(phone.getByTestId("viewer-age")).toContainText("gesendet vor");
    await expect(phone.getByTestId("viewer-ai")).toContainText('"motto": "Neonnacht"');
    // ohne Anmeldung: Hinweis mit Anmelde-Link
    await phone.unroute("**/api/debug-context");
    await phone.unroute("**/api/lyrics-status");
    await phone.route("**/api/lyrics-status", (r) => r.fulfill({ status: 401, json: { error: "Nicht angemeldet." } }));
    await phone.reload();
    await expect(phone.getByTestId("viewer-login")).toContainText("Mit Spotify anmelden");
    await expect(phone.getByTestId("lyrics-status")).toHaveCount(0);
    await phone.close();
  });

  test("Erinnerungsfoto: Knopf → Blitz → Vorschau mit Bühne und Songzeile", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/?demo=neonlicht&t=46000&qualitaet=mittel");
    await ready(page);
    await tapControl(page, page.getByTestId("photo-button"));
    const card = page.getByTestId("photo-card");
    // Demo: nicht hochgeladen, aber zusammengesetzt (mit Vorschau)
    await expect(card).toHaveAttribute("data-phase", "fertig");
    await expect(card).toContainText("Demo");
    // das Bild zeigt die Bühne (nicht schwarz/leer – sonst wäre im falschen Moment gelesen worden)
    const stats = await card.locator("img").evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, Math.round(c.height * 0.6)).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i]! + d[i + 1]! + d[i + 2]!;
      return { w: img.naturalWidth, mean: sum / (d.length / 4) / 3 };
    });
    expect(stats.w).toBeGreaterThan(600);
    expect(stats.mean).toBeGreaterThan(12);
    expect(errors).toEqual([]);
  });

  test("/debug: Bildrate am Kiosk je Bühne und Qualität", async ({ page }) => {
    const now = Date.now();
    const sample = (min: number, msg: string) => ({
      level: "info",
      source: "leistung",
      message: msg,
      count: 1,
      at: now - min * 60_000,
    });
    await page.route("**/api/debug-context", (r) => r.fulfill({ json: { entry: null } }));
    await page.route("**/api/lyrics-status", (r) => r.fulfill({ json: { now, providers: [] } }));
    await page.route("**/api/log", (r) =>
      r.fulfill({
        json: {
          entries: [
            sample(30, "31 fps (min 24), Qualität mittel, Bühne jazz, 1280×800"),
            sample(25, "22 fps (min 14), Qualität mittel, Bühne club, 1280×800"),
            sample(20, "26 fps (min 17), Qualität mittel, Bühne club, 1280×800"),
            { level: "fehler", source: "js", message: "irgendwas", count: 1, at: now },
          ],
        },
      }),
    );
    await page.goto("/debug");
    const rows = page.getByTestId("perf-row");
    await expect(rows).toHaveCount(2);
    // schwächste Bühne zuerst
    await expect(rows.first()).toContainText("club");
    await expect(rows.first()).toContainText("24 fps · knapp");
    await expect(rows.first()).toContainText("14 fps");
    await expect(rows.nth(1)).toContainText("31 fps · flüssig");
    await expect(page.getByTestId("perf-line")).toBeVisible();
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

  test("„Gleich kommt …“: Vorschau auf den nächsten Song in den letzten Sekunden", async ({ page }) => {
    // Demo: der nächste Song ist die nächste Demo der Liste (Neonlicht → Abendrot am Hafen)
    await page.goto("/?demo=neonlicht&t=190000&qualitaet=niedrig");
    await ready(page);
    const card = page.getByTestId("up-next");
    await expect(card).toHaveAttribute("data-visible", "true");
    await expect(card).toContainText("Gleich");
    await expect(card).toContainText("Abendrot am Hafen");
    // mitten im Song: keine Vorschau
    await page.goto("/?demo=neonlicht&t=46000&qualitaet=niedrig");
    await ready(page);
    await expect(page.getByTestId("up-next")).toHaveCount(0);
  });

  test("Sicherheits-Header sind gesetzt", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["content-security-policy"]).toContain("default-src 'self'");
    expect(h["permissions-policy"]).toContain("microphone=(self)");
    expect(h["x-frame-options"]).toBe("DENY");
  });
});

test("Startbildschirm: Rückblick auf den Abend nach der Musik", async ({ page }) => {
  const now = Date.now();
  const entry = (minAgo: number, title: string, artist: string, extra: Record<string, unknown> = {}) => ({
    trackKey: title,
    title,
    artist,
    durationMs: 200_000,
    at: now - minAgo * 60_000,
    ...extra,
  });
  await page.addInitScript(
    (log) => localStorage.setItem("ss_abend", JSON.stringify(log)),
    [
      entry(30, "Bussi Baby", "Wanda"),
      entry(26, "Maschin", "Bilderbuch", { liked: true }),
      entry(22, "Amore", "Wanda", { phase: "hoehepunkt" }),
      entry(18, "Columbo", "Wanda", { phase: "zugabe" }),
    ],
  );
  // ohne laufenden Song (unbekannte Demo → Startbildschirm im Leerlauf)
  await page.goto("/?demo=gibtsnicht");
  const recap = page.getByTestId("evening-recap");
  await expect(recap).toContainText("Euer Abend");
  await expect(page.getByTestId("recap-facts")).toContainText("4 Songs");
  await expect(recap).toContainText("Höhepunkt: Amore");
  await expect(recap).toContainText("Zugabe: Columbo");
  await expect(recap).toContainText("Meistgespielt: Wanda (3 Songs)");
  await expect(page.getByTestId("recap-songs").locator("li").first()).toContainText("Columbo");

  // als Bild aufs Handy: Hochformat-JPEG hochladen, QR-Code zur Foto-Seite
  let uploaded: Buffer | null = null;
  await page.route("**/api/photo", async (r) => {
    uploaded = r.request().postDataBuffer();
    await r.fulfill({ json: { id: "AbCdEfGhIjKlMnOpQrStUv" } });
  });
  // der Startbildschirm wandert langsam (Schutz vor Einbrennen) – nie „ruhig“ genug für einen Playwright-Klick
  await page.getByTestId("recap-share-button").dispatchEvent("click");
  await expect(page.getByTestId("recap-share")).toHaveAttribute("data-url", /\/foto\/AbCdEfGhIjKlMnOpQrStUv$/);
  expect(uploaded!.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  expect(uploaded!.length).toBeGreaterThan(20_000);
  if (process.env.RECAP_IMAGE_OUT) (await import("node:fs")).writeFileSync(process.env.RECAP_IMAGE_OUT, uploaded!);
});
