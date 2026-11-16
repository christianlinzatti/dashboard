import { expect, test } from "@playwright/test";
import { debugContext } from "./helpers";

const track = {
  id: "0VjIjW4GlUZAMYd2vXMi3b",
  type: "track",
  name: "Regielied",
  duration_ms: 200_000,
  explicit: false,
  artists: [{ id: "1Xyo4u8uXC1ZmMpatF05PJ", name: "Band" }],
  album: { name: "Album", release_date: "2019-05-03", images: [{ url: "/demo/pulsar.svg", width: 300, height: 300 }] },
};
const brief = {
  stage: "weltraum",
  mood: "ruhig",
  genres: ["dream pop"],
  motto: "Ein Tanz zwischen den Sternen.",
  sections: [{ kind: "verse", energy: "mittel", lyrics: "welle", crowd: "wiegen", effects: [] }],
};

async function live(page: import("@playwright/test").Page, progressMs: number) {
  await page.route("**/api/now-playing", (r) =>
    r.fulfill({ json: { state: "playing", progressMs, fetchedAt: 0, track, user: "T" } }),
  );
  await page.route("**/api/lyrics?*", (r) =>
    r.fulfill({ json: { lyrics: null, instrumental: true, cached: false, attempts: [] } }),
  );
}
type Ctx = {
  song?: {
    show?: { stage: string };
    music?: { genres: string[]; mood?: string };
    status?: { show?: { state: string; provider?: string } };
  };
};
const context = (page: import("@playwright/test").Page) => debugContext<Ctx>(page).catch(() => null);

test("Live: Regie (Genres, Stimmung, KI-Brief) kommt von /api/show und bestimmt die Bühne", async ({ page }) => {
  await live(page, 2000);
  let asked: URL | undefined;
  await page.route("**/api/show?*", (r) => {
    asked = new URL(r.request().url());
    return r.fulfill({
      json: { genres: ["dream pop"], mood: "ruhig", brief, source: { tags: "quellen", brief: "claude-opus-5-5" } },
    });
  });
  await page.goto("/?debug=1");
  await expect.poll(async () => (await context(page))?.song?.show?.stage, { timeout: 20_000 }).toBe("weltraum");
  const song = (await context(page))!.song!;
  expect(song.music).toMatchObject({ genres: ["dream pop"], mood: "ruhig" });
  expect(song.status!.show).toMatchObject({ state: "ok", provider: "claude-opus-5-5" });
  await expect(page.locator("[data-theme=weltraum]")).toBeVisible();
  expect(asked?.searchParams.get("title")).toBe("Regielied");
  expect(asked?.searchParams.get("artists")).toBe("Band");
  expect(asked?.searchParams.get("album")).toBe("Album");
  expect(asked?.searchParams.get("year")).toBe("2019");
});

test("Live: kommt die Regie erst mitten im Song, wird nichts mehr umgestellt", async ({ page }) => {
  await live(page, 90_000);
  await page.route("**/api/show?*", (r) =>
    r.fulfill({ json: { genres: ["jazz"], brief, source: { tags: "quellen", brief: "claude-opus-5-5" } } }),
  );
  await page.goto("/?debug=1");
  await expect.poll(async () => (await context(page))?.song?.status?.show?.state, { timeout: 20_000 }).toBe("ok");
  const song = (await context(page))!.song!;
  expect(song.show).toBeUndefined();
  expect(song.music!.genres).toEqual([]);
});

test("Show-API nur mit Anmeldung", async ({ request }) => {
  expect((await request.get("/api/show?track=t&title=x&artists=y&durationMs=200000")).status()).toBe(401);
});
