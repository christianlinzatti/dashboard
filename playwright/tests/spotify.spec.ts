import { expect, test } from "@playwright/test";
import { tapControl } from "./helpers";

const track = {
  id: "e2e-track",
  type: "track",
  name: "Testlied (feat. Gast)",
  duration_ms: 200_000,
  explicit: false,
  artists: [
    { id: "a1", name: "Hauptkünstler" },
    { id: "a2", name: "Gast" },
  ],
  album: { name: "Album", images: [{ url: "/demo/abendrot.svg", width: 300, height: 300 }] },
};

test.describe("Spotify-Anbindung", () => {
  test("ohne Anmeldung: Login-Bildschirm", async ({ page }) => {
    await page.goto("/");
    const idle = page.getByTestId("idle");
    await expect(idle).toHaveAttribute("data-status", "login");
    await expect(page.getByTestId("login")).toHaveAttribute("href", "/api/auth/login");
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("anmeldung.png");
  });

  test("Fehlermeldung nach abgebrochener Anmeldung", async ({ page }) => {
    await page.goto("/?fehler=abgebrochen");
    await expect(page.getByTestId("idle").getByRole("alert")).toHaveText("Die Anmeldung wurde abgebrochen.");
  });

  test("Login leitet mit PKCE zu Spotify weiter", async ({ request }) => {
    const res = await request.get("/api/auth/login", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    const url = new URL(res.headers()["location"]!);
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("client_id")).toBe("e2e-client-id");
    expect(url.searchParams.get("scope")).toContain("user-read-currently-playing");
    expect(res.headers()["set-cookie"]).toContain("ss_oauth=");
    expect(res.headers()["set-cookie"]).toContain("HttpOnly");
  });

  test("Callback mit falschem state wird abgewiesen", async ({ request }) => {
    const res = await request.get("/api/auth/callback?code=x&state=falsch", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("fehler=ungueltig");
  });

  test("API ohne Anmeldung liefert 401, Alexa ohne Konfiguration 503", async ({ request }) => {
    expect((await request.get("/api/now-playing")).status()).toBe(401);
    expect((await request.post("/api/player/next")).status()).toBe(401);
    expect((await request.post("/api/song-context", { data: {} })).status()).toBe(401);
    expect((await request.post("/api/alexa", { data: {} })).status()).toBe(503);
  });

  test("laufender Song wird angezeigt, Steuerleiste per Berührung", async ({ page }) => {
    // Live-Betrieb rendert dauerhaft – mit niedriger Qualität bleibt der CI-Runner bedienbar
    await page.addInitScript(() => localStorage.setItem("ss_settings", JSON.stringify({ quality: "niedrig", strobe: true })));
    let calls = 0;
    await page.route("**/api/now-playing", (route) => {
      calls++;
      return route.fulfill({
        json: { state: "playing", progressMs: 46_000, fetchedAt: Date.now(), device: "Wohnzimmer", track, user: "Test" },
      });
    });
    await page.route("**/api/player/pause", (route) =>
      route.fulfill({ status: 403, json: { error: "Spotify erlaubt diese Steuerung für die App nicht." } }),
    );

    await page.goto("/");
    await expect(page.getByTestId("now-playing")).toContainText("Testlied (feat. Gast)");
    await expect(page.getByTestId("now-playing")).toContainText("Hauptkünstler feat. Gast");
    await expect(page.getByTestId("progress")).toContainText("0:46");

    // Steuerleiste erscheint nach Berührung; Offset lässt sich ändern
    await tapControl(page, page.locator('[aria-label="Lyrics später"]'));
    await expect(page.getByTestId("offset")).toHaveText("Lyrics +0,1 s");

    // Lampen-Schalter (Pi-Bridge ist im Test nicht vorhanden → Hinweis)
    await expect(page.getByTestId("lamps-toggle")).toContainText("Lampen an");
    await expect(page.getByTestId("lamps-toggle")).toContainText("keine Bridge");
    await tapControl(page, page.getByTestId("lamps-toggle"));
    await expect(page.getByTestId("lamps-toggle")).toContainText("Lampen aus");

    // 403 von Spotify wird verständlich angezeigt
    await tapControl(page, page.locator('[aria-label="Pause"]'));
    await expect(page.getByRole("status")).toHaveText("Spotify erlaubt diese Steuerung für die App nicht.");
    expect(calls).toBeGreaterThan(0);
  });

  test("Songwechsel: Umbau mit dem nächsten Song, nach einem ausgespielten Lieblingssong Zugabe-Rufe", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("ss_settings", JSON.stringify({ quality: "niedrig", strobe: true })));
    let state: "a" | "b" | "c" = "a";
    let progressMs = 1000;
    const names = { a: "Testlied", b: "Zweites Lied", c: "Drittes Lied" };
    await page.route("**/api/now-playing", (route) =>
      route.fulfill({
        json: { state: "playing", progressMs, fetchedAt: 0, track: { ...track, id: state, name: names[state] } },
      }),
    );
    // alle Songs sind Lieblingssongs
    await page.route("**/api/personal?*", (r) => r.fulfill({ json: { user: { trackSaved: true, artists: {} } } }));
    const poll = () => page.evaluate(() => window.dispatchEvent(new Event("ss:poll-now")));
    const transition = page.getByTestId("song-transition");
    await page.goto("/");
    await expect(page.getByTestId("now-playing")).toContainText("Testlied");
    // erster Song des Abends: kein Umbau
    await expect(transition).toHaveCount(0);

    // Wechsel mitten im Song (geskippt): normaler Umbau mit dem nächsten Song und seinem Motto
    state = "b";
    await poll();
    await expect(transition).toHaveAttribute("data-visible", "true");
    await expect(transition).toHaveAttribute("data-kind", "umbau");
    await expect(transition).toContainText("Zweites Lied");
    await expect(page.getByTestId("motto")).toContainText("Zweites Lied");
    // sobald die neue Bühne steht, geht das Licht wieder an
    await expect(transition).toHaveAttribute("data-visible", "false", { timeout: 15_000 });

    // Lieblingssong bis zum Ende gespielt → das Publikum ruft nach einer Zugabe
    await expect(page.getByTestId("badge-saved")).toBeVisible();
    progressMs = 195_000;
    await poll();
    // erst wechseln, wenn das Dashboard die neue Position wirklich übernommen hat (langsame CI-Rechner)
    await expect(page.getByTestId("progress")).toContainText("3:1");
    state = "c";
    progressMs = 1000;
    await poll();
    await expect(transition).toHaveAttribute("data-kind", "zugabe");
    await expect(page.getByTestId("zugabe")).toHaveText("Zugabe! Zugabe!");
    await expect(transition).toContainText("Drittes Lied");
    await expect(page.locator("[data-evening=zugabe]")).toHaveCount(1);
  });

  test("Songwechsel und Stille werden übernommen", async ({ page }) => {
    let state: "a" | "b" | "idle" = "a";
    await page.route("**/api/now-playing", (route) =>
      route.fulfill({
        json:
          state === "idle"
            ? { state: "idle", user: "Test" }
            : {
                state: "playing",
                progressMs: 1000,
                fetchedAt: 0,
                track: state === "a" ? track : { ...track, id: "b", name: "Zweites Lied" },
              },
      }),
    );
    await page.goto("/");
    await expect(page.getByTestId("now-playing")).toContainText("Testlied");
    state = "b";
    await page.evaluate(() => window.dispatchEvent(new Event("ss:poll-now")));
    await expect(page.getByTestId("now-playing")).toContainText("Zweites Lied");
    state = "idle";
    await page.evaluate(() => window.dispatchEvent(new Event("ss:poll-now")));
    await expect(page.getByTestId("idle")).toContainText("Hallo Test");
  });
});
