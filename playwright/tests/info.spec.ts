import { expect, test } from "@playwright/test";
import { hideStage, ready } from "./helpers";

test.describe("Band-Infos", () => {
  test("Infokarte im Intro mit Foto-Nachweis und Quelle; Lyrics machen Platz", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=3000");
    await ready(page);
    const card = page.getByTestId("info-card");
    await expect(card).toContainText("Mira Sol");
    await expect(card).toContainText("Geboren 1996");
    await expect(page.getByTestId("photo-credit")).toHaveText("Foto: Demo-Grafik · CC0");
    await expect(card).toContainText("Text: Wikipedia");
    await expect(page.getByTestId("lyrics")).toHaveCount(0);
    await hideStage(page);
    await expect(card).toHaveScreenshot("infokarte.png");
  });

  test("Feature-Song: Karte wechselt zum zweiten Artist", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=180000"); // Outro, zweites 12-s-Fenster
    await expect(page.getByTestId("info-card")).toContainText("Kai Vento");
  });

  test("während gesungen wird: keine Karte; in Strophen Fakten-Ticker", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=25000&lyrics=karaoke");
    await ready(page);
    await expect(page.getByTestId("info-card")).toHaveCount(0);
    // erste Einblendung in einer Strophe: Song-Trivia (Genius)
    await expect(page.getByTestId("fact-ticker")).toHaveText("Neonlicht · Produziert von Lumen Labs");
  });

  test("Live: Infos werden nach Songwechsel geladen", async ({ page }) => {
    const track = {
      id: "e2e-info",
      type: "track",
      name: "Testlied",
      duration_ms: 200_000,
      explicit: false,
      artists: [{ id: "a1", name: "Testband" }],
      album: { name: "Album", images: [{ url: "/demo/pulsar.svg", width: 300, height: 300 }] },
    };
    await page.route("**/api/now-playing", (r) =>
      r.fulfill({ json: { state: "playing", progressMs: 2000, fetchedAt: 0, track, user: "Test" } }),
    );
    await page.route("**/api/lyrics?*", (r) =>
      r.fulfill({ json: { lyrics: null, instrumental: true, cached: false, attempts: [] } }),
    );
    let requested: URL | undefined;
    await page.route("**/api/info?*", (r) => {
      requested = new URL(r.request().url());
      return r.fulfill({
        json: {
          complete: true,
          info: {
            artists: {
              a1: {
                name: "Testband",
                summary: "Eine Band aus dem Test.",
                wikiUrl: "https://de.wikipedia.org/wiki/Test",
                lang: "de",
                facts: ["Gegründet 1999"],
                textSource: "theaudiodb",
                logo: "https://r2.theaudiodb.com/images/media/artist/logo/test.png",
              },
            },
            photos: [],
          },
        },
      });
    });
    await page.goto("/");
    await expect(page.getByTestId("info-card")).toContainText("Gegründet 1999");
    expect(requested?.searchParams.get("names")).toBe("Testband");
    expect(requested?.searchParams.get("title")).toBe("Testlied");
    // Text von TheAudioDB richtig ausgewiesen, Logo über den eigenen Bildoptimierer (kein CORS)
    await expect(page.getByTestId("info-card")).toContainText("Text: TheAudioDB");
    const logo = page.getByTestId("artist-logo");
    await expect(logo).toHaveAttribute("alt", "Testband");
    await expect(logo).toHaveAttribute("src", /^\/_next\/image\?url=https%3A%2F%2Fr2\.theaudiodb\.com/);
  });

  test("Info-API nur mit Anmeldung", async ({ request }) => {
    expect((await request.get("/api/info?ids=a&names=b")).status()).toBe(401);
  });
});

test("Live: Band-Logo erscheint auf der Bühne und in der Infokarte", async ({ page }) => {
  const track = {
    id: "0VjIjW4GlUZAMYd2vXMi3b",
    type: "track",
    name: "Logolied",
    duration_ms: 200_000,
    explicit: false,
    artists: [{ id: "a1", name: "Testband" }],
    album: { name: "A", images: [{ url: "/demo/pulsar.svg", width: 300, height: 300 }] },
  };
  await page.route("**/api/now-playing", (r) =>
    r.fulfill({ json: { state: "playing", progressMs: 2000, fetchedAt: 0, track, user: "Test" } }),
  );
  await page.route("**/api/lyrics?*", (r) =>
    r.fulfill({ json: { lyrics: null, instrumental: true, cached: false, attempts: [] } }),
  );
  await page.route("**/api/info?*", (r) =>
    r.fulfill({
      json: {
        complete: true,
        info: {
          artists: {
            a1: { name: "Testband", summary: "Eine Band.", wikiUrl: "u", lang: "de", facts: [], logo: "/demo/test-logo.svg" },
          },
          photos: [],
        },
      },
    }),
  );
  // Logo erscheint auf der LED-Wand – Bühne fest auf Club (ohne Genre wechselt sie sonst pro Song)
  await page.addInitScript(() => localStorage.setItem("ss_settings", JSON.stringify({ stage: "club" })));
  await page.goto("/");
  await expect(page.locator("[data-wall-logo]")).toHaveAttribute("data-wall-logo", "/demo/test-logo.svg");
  await expect(page.getByTestId("artist-logo")).toHaveAttribute("src", "/demo/test-logo.svg");
});

test("Bildoptimierer liefert genau die Breiten, die das Dashboard anfragt", async ({ request }) => {
  // 1280 fehlte in der Konfiguration: Wandfotos von TheAudioDB/Flickr kamen im Live-Betrieb nie an
  for (const w of [128, 640, 1280]) {
    const res = await request.get(`/_next/image?url=${encodeURIComponent("/avatars/atlas-prism.png")}&w=${w}&q=75`);
    expect(res.status(), `Breite ${w}`).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\//);
  }
  expect((await request.get(`/_next/image?url=${encodeURIComponent("/avatars/atlas-prism.png")}&w=1000&q=75`)).status()).toBe(
    400,
  );
  // fremde Hosts bleiben gesperrt
  const foreign = await request.get(`/_next/image?url=${encodeURIComponent("https://example.org/x.jpg")}&w=640&q=75`);
  expect(foreign.status()).toBe(400);
});
