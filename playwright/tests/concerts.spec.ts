import { expect, test } from "@playwright/test";
import { hideStage, ready } from "./helpers";

test.describe("Konzerte", () => {
  test("Demo: Konzertkarte am Songende mit Countdown, ausverkauft und Ticket-QR", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=190000");
    await ready(page);
    const card = page.getByTestId("concert-card");
    await expect(card).toContainText("Live in deiner Nähe");
    const rows = card.getByTestId("concert-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText("Sa, 5. Dez.");
    await expect(rows.nth(0)).toContainText("in 21 Tagen");
    await expect(rows.nth(1)).toContainText("ausverkauft");
    await expect(rows.nth(2)).toContainText("Berlin");
    await expect(card.getByTestId("ticket-qr")).toContainText("Tickets Wien");
    await expect(card.getByTestId("live-hint")).toContainText("dieser Song war dabei");
    await expect(card.getByTestId("osm-credit")).toHaveCount(0); // Demo-Entfernungen ohne OpenStreetMap
    // Info-Karte und Lyrics machen Platz
    await expect(page.getByTestId("info-card")).toHaveCount(0);
    await hideStage(page);
    await expect(card).toHaveScreenshot("konzertkarte.png");
  });

  test("Demo: vor dem Songende keine Konzertkarte", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=180000");
    await expect(page.getByTestId("info-card")).toBeVisible();
    await expect(page.getByTestId("concert-card")).toHaveCount(0);
  });

  test("Live: Termine kommen von /api/concerts", async ({ page }) => {
    const track = {
      id: "e2e-konzert",
      type: "track",
      name: "Tourlied",
      duration_ms: 20_000,
      explicit: false,
      artists: [{ id: "0OdUWJ0sBjDrqHygGUXeCF", name: "Band" }],
      album: { name: "A", images: [{ url: "/demo/pulsar.svg", width: 300, height: 300 }] },
    };
    await page.route("**/api/now-playing", (r) =>
      r.fulfill({ json: { state: "playing", progressMs: 6_000, fetchedAt: 0, track, user: "T" } }),
    );
    await page.route("**/api/lyrics?*", (r) =>
      r.fulfill({ json: { lyrics: null, instrumental: true, cached: false, attempts: [] } }),
    );
    await page.route("**/api/info?*", (r) => r.fulfill({ json: { complete: true, info: { artists: {}, photos: [] } } }));
    await page.route("**/api/personal?*", (r) => r.fulfill({ json: { user: { artists: {} } } }));
    await page.route("**/api/concerts?*", (r) =>
      r.fulfill({
        json: {
          providers: ["ticketmaster"],
          setlists: {},
          area: { name: "Linz", radiusKm: 100 },
          concerts: [
            {
              artistId: "0OdUWJ0sBjDrqHygGUXeCF",
              artistName: "Band",
              date: "2099-06-01",
              venue: "Arena",
              city: "Hamburg",
              distanceKm: 740,
              geocoded: true,
              providers: ["ticketmaster"],
            },
          ],
        },
      }),
    );
    await page.goto("/");
    const card = page.getByTestId("concert-card");
    await expect(card).toContainText("Nächste Konzerte");
    await expect(card.getByTestId("concert-area")).toHaveText("Linz · 100 km");
    await expect(card).toContainText("Hamburg");
    await expect(card.getByTestId("osm-credit")).toHaveText("Ortsdaten © OpenStreetMap");
    await expect(card.getByTestId("ticket-qr")).toHaveCount(0);
  });

  test("API nur mit Anmeldung", async ({ request }) => {
    expect((await request.get("/api/concerts?ids=a&names=b")).status()).toBe(401);
  });
});
