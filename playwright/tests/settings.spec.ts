import { expect, test } from "@playwright/test";

test("Einstellungen: Heimatort und Umkreis setzen, Fehler anzeigen, zurücksetzen", async ({ page }) => {
  let area = { name: "Wien", lat: 48.2082, lon: 16.3738, radiusKm: 200, custom: false };
  const puts: unknown[] = [];
  await page.route("**/api/prefs", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: { area } });
    const b = r.request().postDataJSON() as { home?: string | null; radiusKm?: number | null };
    puts.push(b);
    if (b.home === "Atlantis") return r.fulfill({ status: 404, json: { error: "„Atlantis“ wurde nicht gefunden." } });
    if (b.home) area = { ...area, name: b.home, lat: 48.3, lon: 14.29, custom: true };
    if (b.radiusKm) area = { ...area, radiusKm: b.radiusKm, custom: true };
    if (b.home === null) area = { name: "Wien", lat: 48.2082, lon: 16.3738, radiusKm: 200, custom: false };
    return r.fulfill({ json: { area } });
  });
  await page.goto("/einstellungen");
  await expect(page.getByTestId("current-area")).toHaveText("Wien · 200 km (Standard)");

  await page.getByTestId("place-input").fill("Linz");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByTestId("current-area")).toHaveText("Linz · 200 km");
  await expect(page.getByTestId("settings-message")).toHaveText("Heimatort gespeichert.");

  await page.getByRole("button", { name: "100 km" }).click();
  await expect(page.getByTestId("current-area")).toHaveText("Linz · 100 km");
  await expect(page.getByRole("button", { name: "100 km" })).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("place-input").fill("Atlantis");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByTestId("settings-message")).toHaveText("„Atlantis“ wurde nicht gefunden.");
  await expect(page.getByTestId("current-area")).toHaveText("Linz · 100 km");

  await page.getByRole("button", { name: "Auf Standard zurücksetzen" }).click();
  await expect(page.getByTestId("current-area")).toHaveText("Wien · 200 km (Standard)");
  expect(puts).toEqual([{ home: "Linz" }, { radiusKm: 100 }, { home: "Atlantis" }, { home: null, radiusKm: null }]);
});

test("Einstellungen ohne Anmeldung: Hinweis zum Anmelden", async ({ page }) => {
  await page.goto("/einstellungen");
  await expect(page.getByTestId("settings")).toContainText("mit Spotify anmelden");
});

test("Einstellungs-API nur mit Anmeldung", async ({ request }) => {
  expect((await request.get("/api/prefs")).status()).toBe(401);
  expect((await request.put("/api/prefs", { data: { radiusKm: 100 } })).status()).toBe(401);
});
