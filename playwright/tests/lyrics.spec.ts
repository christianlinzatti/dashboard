import { expect, test } from "@playwright/test";

const track = {
  id: "e2e-lyrics",
  type: "track",
  name: "Testlied",
  duration_ms: 200_000,
  explicit: false,
  artists: [{ id: "a1", name: "Band" }],
  album: { name: "Album", images: [{ url: "/demo/neonlicht.svg", width: 300, height: 300 }] },
};

const lyrics = {
  provider: "lrclib",
  quality: "word-estimated",
  sections: [{ kind: "verse", startMs: 0, endMs: 200_000 }],
  lines: [
    { startMs: 0, endMs: 60_000, text: "Eine sehr lange erste Zeile", words: [
      { startMs: 0, endMs: 10_000, text: "Eine" },
      { startMs: 10_000, endMs: 20_000, text: "sehr" },
      { startMs: 20_000, endMs: 30_000, text: "lange" },
      { startMs: 30_000, endMs: 40_000, text: "erste" },
      { startMs: 40_000, endMs: 60_000, text: "Zeile" },
    ] },
    { startMs: 61_000, endMs: 70_000, text: "Danach die zweite" },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/now-playing", (route) =>
    route.fulfill({ json: { state: "playing", progressMs: 15_000, fetchedAt: 0, track, user: "Test" } }),
  );
});

test("Lyrics werden beim Songwechsel geladen und angezeigt", async ({ page }) => {
  let requested: URL | undefined;
  await page.route("**/api/lyrics?*", (route) => {
    requested = new URL(route.request().url());
    return route.fulfill({ json: { lyrics, instrumental: false, cached: false, attempts: [{ provider: "lrclib", outcome: "ok", ms: 120 }] } });
  });
  await page.goto("/");
  await expect(page.getByTestId("lyrics-current")).toHaveText("Eine sehr lange erste Zeile");
  await expect(page.getByTestId("lyrics-quality")).toHaveText("Wort-Sync (geschätzt)");
  await expect(page.getByTestId("section")).toHaveText("Strophe");
  expect(requested?.searchParams.get("title")).toBe("Testlied");
  expect(requested?.searchParams.get("durationMs")).toBe("200000");
});

test("keine Lyrics gefunden", async ({ page }) => {
  await page.route("**/api/lyrics?*", (route) =>
    route.fulfill({ json: { lyrics: null, instrumental: false, cached: false, attempts: [{ provider: "lrclib", outcome: "empty", ms: 80 }] } }),
  );
  await page.goto("/");
  await expect(page.getByTestId("lyrics-none")).toHaveText("Instrumental – keine Lyrics gefunden");
});

test("Lyrics-Dienst nicht erreichbar", async ({ page }) => {
  await page.route("**/api/lyrics?*", (route) => route.fulfill({ status: 502, json: {} }));
  await page.goto("/");
  await expect(page.getByTestId("lyrics-none")).toHaveText("Lyrics-Dienst gerade nicht erreichbar");
});

test("Lyrics-API nur mit Anmeldung", async ({ request }) => {
  const res = await request.get("/api/lyrics?trackKey=x&title=y&artists=z&durationMs=1000");
  expect(res.status()).toBe(401);
});
