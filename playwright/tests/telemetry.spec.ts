import { expect, test } from "@playwright/test";

test("Live: Fehler werden gemeldet, Debug-Panel zeigt Bildrate und Protokoll", async ({ page }) => {
  const track = {
    id: "0VjIjW4GlUZAMYd2vXMi3b",
    type: "track",
    name: "Protokolllied",
    duration_ms: 200_000,
    explicit: false,
    artists: [{ id: "1Xyo4u8uXC1ZmMpatF05PJ", name: "Band" }],
    album: { name: "A", images: [{ url: "/demo/pulsar.svg", width: 300, height: 300 }] },
  };
  await page.route("**/api/now-playing", (r) =>
    r.fulfill({ json: { state: "playing", progressMs: 30_000, fetchedAt: 0, track, user: "T" } }),
  );
  await page.route("**/api/lyrics?*", (r) =>
    r.fulfill({ json: { lyrics: null, instrumental: true, cached: false, attempts: [] } }),
  );
  const posted: Array<{ entries: Array<{ source: string; message: string }> }> = [];
  await page.route("**/api/log", (r) => {
    if (r.request().method() === "POST") {
      posted.push(r.request().postDataJSON());
      return r.fulfill({ json: { ok: true } });
    }
    return r.fulfill({
      json: {
        entries: [{ level: "fehler", source: "3D-Bühne", message: "Avatar konnte nicht laden", count: 3, at: 1_794_700_000_000 }],
      },
    });
  });
  // Live-Bühne hängt von der Tagesform ab – für einen stabilen Test fest auf Club/niedrig
  await page.addInitScript(() => localStorage.setItem("ss_settings", JSON.stringify({ stage: "club", quality: "niedrig" })));
  await page.goto("/?debug=1");
  await expect(page.getByTestId("debug-log")).toContainText("3D-Bühne: Avatar konnte nicht laden (×3)");
  await expect(page.getByTestId("debug-fps")).toHaveText(/Bildrate: \d+ fps · Qualität niedrig/, {
    timeout: 30_000,
  });

  // ein Laufzeitfehler wird gesammelt und beim Verlassen der Seite gesendet
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("Testfehler aus dem Kiosk");
    });
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await expect
    .poll(() =>
      posted
        .flatMap((p) => p.entries)
        .map((e) => `${e.source}: ${e.message}`)
        .join("\n"),
    )
    .toContain("js: Error: Testfehler aus dem Kiosk");
});

test("Protokoll-API nur mit Anmeldung", async ({ request }) => {
  expect((await request.get("/api/log")).status()).toBe(401);
  expect((await request.post("/api/log", { data: { entries: [] } })).status()).toBe(401);
});
