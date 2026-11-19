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

test("Einstellungen: eigener Avatar für einen Künstler", async ({ page }) => {
  const area = { name: "Wien", lat: 48.2082, lon: 16.3738, radiusKm: 200, custom: false };
  let artistAvatars: Record<string, { name: string; avatarId: string; outfit?: string }> = {};
  const puts: unknown[] = [];
  await page.route("**/api/prefs", async (r) => {
    if (r.request().method() === "GET") return r.fulfill({ json: { area, artistAvatars } });
    const b = r.request().postDataJSON() as { artistAvatar: { name: string; avatarId: string | null; outfit?: string } };
    puts.push(b);
    const key = b.artistAvatar.name.toLowerCase();
    if (b.artistAvatar.avatarId === null)
      artistAvatars = Object.fromEntries(Object.entries(artistAvatars).filter(([k]) => k !== key));
    else artistAvatars = { ...artistAvatars, [key]: { ...b.artistAvatar, avatarId: b.artistAvatar.avatarId } };
    return r.fulfill({ json: { area, artistAvatars } });
  });
  // Vorschläge aus dem laufenden Song und den letzten Songs
  await page.route("**/api/song-context", (r) =>
    r.fulfill({
      json: {
        snapshot: {
          artists: [
            { name: "Mira Sol", role: "main" },
            { name: "Kai Vento", role: "feature" },
          ],
        },
      },
    }),
  );
  await page.route("**/api/recent", (r) =>
    r.fulfill({ json: { source: "lastfm", tracks: [{ artist: "Mira Sol" }, { artist: "Lena Brandt" }] } }),
  );
  await page.goto("/einstellungen");
  const section = page.getByTestId("artist-avatars");
  await expect(section.getByRole("button", { name: "Lena Brandt" })).toBeVisible();
  await expect(section.getByRole("button", { name: "Mira Sol" })).toHaveCount(1);

  await expect(page.getByTestId("artist-save")).toBeDisabled();
  await section.getByRole("button", { name: "Mira Sol" }).click();
  await expect(page.getByTestId("artist-input")).toHaveValue("Mira Sol");
  await page.getByTestId("avatar-velvet-jazz").click();
  await section.getByRole("radio", { name: "Gold" }).click();
  await page.getByTestId("artist-save").click();
  await expect(page.getByTestId("settings-message")).toContainText("Mira Sol tritt jetzt als Velvet Jazz auf.");
  await expect(page.getByTestId("artist-avatar-list")).toContainText("Velvet Jazz · Gold");

  await section.getByRole("button", { name: "Entfernen" }).click();
  await expect(page.getByTestId("artist-avatar-list")).toHaveCount(0);
  expect(puts).toEqual([
    { artistAvatar: { name: "Mira Sol", avatarId: "velvet-jazz", outfit: "gold" } },
    { artistAvatar: { name: "Mira Sol", avatarId: null } },
  ]);
});

test("Einstellungen: Bildschirm nachts aus", async ({ page }) => {
  const area = { name: "Wien", lat: 48.2082, lon: 16.3738, radiusKm: 200, custom: false };
  let quietHours: { from: string; to: string } | null = null;
  const puts: unknown[] = [];
  await page.route("**/api/prefs", async (r) => {
    if (r.request().method() === "PUT") {
      const b = r.request().postDataJSON() as { quietHours: { from: string; to: string } | null };
      puts.push(b);
      quietHours = b.quietHours;
    }
    return r.fulfill({ json: { area, artistAvatars: {}, quietHours } });
  });
  await page.goto("/einstellungen");
  await expect(page.getByTestId("quiet-hours-current")).toContainText("Aus");
  await page.getByTestId("quiet-from").fill("22:30");
  await page.getByTestId("quiet-save").click();
  await expect(page.getByTestId("quiet-hours-current")).toHaveText("Ruhezeit 22:30–07:00 Uhr");
  await page.getByTestId("quiet-off").click();
  await expect(page.getByTestId("quiet-hours-current")).toContainText("Aus");
  expect(puts).toEqual([{ quietHours: { from: "22:30", to: "07:00" } }, { quietHours: null }]);
});

test("Ruhezeit: Bildschirm schwarz ohne Musik, Antippen weckt, mit Musik immer an", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-20T02:00:00"));
  // angehaltene Demo = keine Musik
  await page.goto("/?demo=neonlicht&t=46000&ruhe=23:00-07:00&qualitaet=niedrig");
  const overlay = page.getByTestId("quiet-hours");
  await expect(overlay).toHaveAttribute("data-off", "true");
  await overlay.click();
  await expect(overlay).toHaveAttribute("data-off", "false");
  // laufende Demo = Musik: keine Ruhezeit
  await page.goto("/?demo=neonlicht&ruhe=23:00-07:00&qualitaet=niedrig");
  await expect(overlay).toHaveAttribute("data-off", "false");
  // außerhalb der Ruhezeit
  await page.clock.setFixedTime(new Date("2026-11-20T12:00:00"));
  await page.goto("/?demo=neonlicht&t=46000&ruhe=23:00-07:00&qualitaet=niedrig");
  await expect(overlay).toHaveAttribute("data-off", "false");
});
