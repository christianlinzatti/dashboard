import { expect, test } from "@playwright/test";
import { ready } from "./helpers";

test.describe("Persönliches", () => {
  test("Demo: Lieblingssong, Hörzahl, Stern am Namensschild des gefolgten Künstlers", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=46000&lyrics=karaoke");
    await ready(page);
    await expect(page.getByTestId("badge-saved")).toContainText("Lieblingssong");
    await expect(page.getByTestId("badge-plays")).toHaveText("37× gehört");
    await expect(page.getByTestId("badge-loved")).toHaveCount(0);
    await expect(page.getByTestId("name-tag").filter({ hasText: "Mira Sol" })).toContainText("★");
    await expect(page.getByTestId("name-tag").filter({ hasText: "Kai Vento" })).not.toContainText("★");
  });

  test("Live: Werte kommen von /api/personal", async ({ page }) => {
    const track = {
      id: "e2e-like",
      type: "track",
      name: "Liebling",
      duration_ms: 200_000,
      explicit: false,
      artists: [{ id: "0OdUWJ0sBjDrqHygGUXeCF", name: "Band" }],
      album: { name: "A", images: [{ url: "/demo/pulsar.svg", width: 300, height: 300 }] },
    };
    await page.route("**/api/now-playing", (r) =>
      r.fulfill({ json: { state: "playing", progressMs: 30_000, fetchedAt: 0, track, user: "T" } }),
    );
    await page.route("**/api/lyrics?*", (r) =>
      r.fulfill({ json: { lyrics: null, instrumental: true, cached: false, attempts: [] } }),
    );
    await page.route("**/api/info?*", (r) => r.fulfill({ json: { complete: true, info: { artists: {}, photos: [] } } }));
    await page.route("**/api/personal?*", (r) =>
      r.fulfill({
        json: {
          user: {
            lovedOnLastfm: true,
            trackPlays: 1204,
            artists: { "0OdUWJ0sBjDrqHygGUXeCF": { following: true, plays: 5000 } },
          },
        },
      }),
    );
    await page.goto("/");
    await expect(page.getByTestId("badge-loved")).toContainText("Last.fm");
    await expect(page.getByTestId("badge-plays")).toHaveText("1.204× gehört");
    await expect(page.getByTestId("badge-following")).toBeVisible();
    await expect(page.getByTestId("badge-saved")).toHaveCount(0);
  });

  test("Startbildschirm: zuletzt gehört", async ({ page }) => {
    await page.route("**/api/now-playing", (r) => r.fulfill({ json: { state: "idle", user: "Test" } }));
    await page.route("**/api/recent", (r) =>
      r.fulfill({
        json: {
          source: "lastfm",
          tracks: [
            { title: "Läuft", artist: "X", nowPlaying: true, loved: false },
            {
              title: "Bohemian Rhapsody",
              artist: "Queen",
              playedAt: Math.floor(Date.now() / 1000) - 600,
              nowPlaying: false,
              loved: true,
            },
          ],
        },
      }),
    );
    await page.goto("/");
    const list = page.getByTestId("recent-list");
    await expect(list).toContainText("Zuletzt gehört");
    await expect(list).toContainText("Last.fm");
    await expect(list).toContainText("Bohemian Rhapsody");
    await expect(list).toContainText("vor 10 Min.");
    await expect(list).not.toContainText("Läuft");
  });

  test("APIs nur mit Anmeldung", async ({ request }) => {
    expect((await request.get("/api/recent")).status()).toBe(401);
    expect((await request.get("/api/personal?trackId=a&title=b&ids=c&names=d")).status()).toBe(401);
  });
});
