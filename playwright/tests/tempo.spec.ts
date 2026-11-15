import { expect, test } from "@playwright/test";
import { debugContext } from "./helpers";

test("Live: Tempo-Startwert kommt über die ISRC von /api/tempo", async ({ page }) => {
  const track = {
    id: "0VjIjW4GlUZAMYd2vXMi3b",
    type: "track",
    name: "Tempolied",
    duration_ms: 200_040,
    explicit: false,
    external_ids: { isrc: "USUG11904206" },
    artists: [{ id: "1Xyo4u8uXC1ZmMpatF05PJ", name: "Band" }],
    album: { name: "A", images: [{ url: "/demo/pulsar.svg", width: 300, height: 300 }] },
  };
  await page.route("**/api/now-playing", (r) =>
    r.fulfill({ json: { state: "playing", progressMs: 30_000, fetchedAt: 0, track, user: "T" } }),
  );
  await page.route("**/api/lyrics?*", (r) =>
    r.fulfill({ json: { lyrics: null, instrumental: true, cached: false, attempts: [] } }),
  );
  let asked: URL | undefined;
  await page.route("**/api/tempo?*", (r) => {
    asked = new URL(r.request().url());
    return r.fulfill({ json: { bpm: 170.8, source: "deezer" } });
  });
  await page.goto("/?debug=1");
  // Panel ist anfangs leer und der Song kommt erst nach dem ersten Abruf – bis dahin weiter abfragen
  const hint = async () =>
    (await debugContext<{ song?: { music?: { bpmHint?: number } } }>(page).catch(() => null))?.song?.music?.bpmHint;
  await expect.poll(hint, { timeout: 20_000 }).toBe(170.8);
  expect(asked?.searchParams.get("isrc")).toBe("USUG11904206");
  expect(asked?.searchParams.get("durationMs")).toBe("200040");
});

test("Tempo-API nur mit Anmeldung", async ({ request }) => {
  expect((await request.get("/api/tempo?isrc=USUG11904206")).status()).toBe(401);
});
