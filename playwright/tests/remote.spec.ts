import { expect, test } from "@playwright/test";

const snapshot = (now: number) => ({
  trackKey: "t1",
  title: "Neonlicht",
  artists: [{ name: "Mira Sol", role: "main" }],
  album: "Demo",
  isPlaying: true,
  positionMs: 60_000,
  durationMs: 200_000,
  section: "chorus",
  activeSinger: null,
  bpm: 124,
  palette: { dominant: "#7b2cff", accent: "#ff4fd8" },
  light: null,
  updatedAt: now,
  stage: { id: "club", effects: ["pyro", "konfetti", "co2"] },
});

test("Fernbedienung: Song, Effekte der Bühne, Befehle und Wiedergabe", async ({ page }) => {
  const sent: unknown[] = [];
  const players: string[] = [];
  let alive = 0;
  await page.route("**/api/remote**", async (r) => {
    if (r.request().method() === "POST") {
      sent.push(r.request().postDataJSON());
      return r.fulfill({ json: { ok: true } });
    }
    if (new URL(r.request().url()).searchParams.get("alive") === "1") alive++;
    return r.fulfill({ json: { snapshot: snapshot(Date.now()) } });
  });
  await page.route("**/api/player/*", async (r) => {
    players.push(new URL(r.request().url()).pathname.split("/").pop()!);
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("/fernbedienung");
  await expect(page.getByTestId("remote-connected")).toHaveAttribute("data-connected", "true");
  await expect(page.getByTestId("remote-song")).toContainText("Neonlicht");
  // nur Effekte, die die Bühne hat
  const fx = page.getByTestId("remote-effects");
  await expect(fx.getByRole("button")).toHaveText(["Funkenfontänen", "Konfetti", "CO₂-Nebel"]);
  await fx.getByRole("button", { name: "Konfetti" }).click();
  await expect(page.getByTestId("remote-message")).toHaveText("Konfetti!");
  await page.getByRole("button", { name: "Lyrics später" }).click();
  await page.getByRole("button", { name: "Bildschirm aus" }).click();
  await page.getByRole("button", { name: "Lagerhalle" }).click();
  await page.getByRole("button", { name: "Nächster Song" }).click();
  await page.getByRole("button", { name: "Pause" }).click();
  await expect.poll(() => sent.length).toBe(4);
  expect(sent).toEqual([
    { command: { type: "effekt", kind: "konfetti" } },
    { command: { type: "versatz", deltaMs: 100 } },
    { command: { type: "bildschirm", on: false } },
    { command: { type: "buehne", value: "lagerhalle" } },
  ]);
  await expect.poll(() => players).toEqual(["next", "pause"]);
  // die Seite meldet sich als offen (schneller Abruf im Kiosk)
  expect(alive).toBeGreaterThanOrEqual(1);
});

test("Fernbedienung ohne Anmeldung: Hinweis; API nur mit Anmeldung", async ({ page, request }) => {
  await page.goto("/fernbedienung");
  await expect(page.getByTestId("remote")).toContainText("mit Spotify anmelden");
  expect((await request.get("/api/remote")).status()).toBe(401);
  expect((await request.post("/api/remote", { data: { command: { type: "effekt", kind: "konfetti" } } })).status()).toBe(401);
  expect((await request.get("/api/commands")).status()).toBe(401);
});
