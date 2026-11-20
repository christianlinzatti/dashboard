import { expect, test } from "@playwright/test";
import { collectErrors, ready, tapControl } from "./helpers";

test.describe("Bühne & Licht", () => {
  for (const q of ["niedrig", "mittel", "hoch"] as const) {
    test(`Qualitätsstufe ${q}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/?demo=neonlicht&t=46000&lyrics=karaoke&qualitaet=${q}`);
      await ready(page);
      await expect(page.locator(`[data-quality=${q}]`)).toBeVisible();
      await expect(page).toHaveScreenshot(`buehne-${q}.png`);
      expect(errors).toEqual([]);
    });
  }

  // Jede Bühne mit typischem Effekt (Songzeit fest → Partikel deterministisch)
  const themes = [
    { theme: "festival", q: "demo=neonlicht&t=41000&lyrics=karaoke", fx: "pyro" },
    { theme: "festival-finale", q: "demo=neonlicht&t=129000&lyrics=karaoke&buehne=festival", fx: "konfetti" },
    { theme: "festival-schaum", q: "demo=neonlicht&t=98000&lyrics=karaoke", fx: "schaum" },
    { theme: "club", q: "demo=instrumental&t=44200&buehne=club", fx: "co2" },
    { theme: "synthwave", q: "demo=hoshizora&t=31000", fx: "ringe" },
    { theme: "jazz", q: "demo=abendrot&t=44000", fx: "glitzer" },
    { theme: "weltraum", q: "demo=neonlicht&t=5000&buehne=weltraum", fx: "sternschnuppen" },
    { theme: "stadion", q: "demo=neonlicht&t=98000&lyrics=karaoke&buehne=stadion", fx: "flammen" },
    { theme: "strand", q: "demo=neonlicht&t=46000&lyrics=karaoke&buehne=strand", fx: "konfetti" },
    { theme: "lagerhalle", q: "demo=instrumental&t=44200&buehne=lagerhalle", fx: "co2" },
    { theme: "kathedrale", q: "demo=abendrot&t=44000&buehne=kathedrale", fx: "funken" },
  ] as const;
  for (const { theme, q, fx } of themes) {
    test(`Bühne ${theme}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/?${q}&qualitaet=hoch`);
      await ready(page);
      await expect(page.locator(`[data-theme=${theme.split("-")[0]}]`)).toBeVisible();
      await expect(page.locator(`[data-testid=stage] canvas[data-fx*=${fx}]`)).toHaveCount(1);
      await expect(page).toHaveScreenshot(`buehne-${theme}.png`);
      expect(errors).toEqual([]);
    });
  }

  // Kamera-Einstellungen und Drehbühne (aus dem Plan des Demo-Songs)
  const shots = [
    { name: "kamera-nah", q: "demo=neonlicht&t=20000&lyrics=karaoke", camera: "nah" },
    { name: "kamera-kreisfahrt", q: "demo=neonlicht&t=50000&lyrics=karaoke", camera: "kreisfahrt" },
    { name: "drehbuehne", q: "demo=abendrot&t=45000", camera: "untersicht+drehbuehne" },
    // Abschied: der Kran zieht sich in der letzten Outro-Phrase zurück
    { name: "kamera-kran", q: "demo=neonlicht&t=196000", camera: "kran" },
  ] as const;
  for (const { name, q, camera } of shots) {
    test(`Kamera ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/?${q}&qualitaet=hoch`);
      await ready(page);
      await expect(page.locator("[data-testid=stage] canvas")).toHaveAttribute("data-camera", camera);
      await expect(page).toHaveScreenshot(`${name}.png`);
      expect(errors).toEqual([]);
    });
  }

  test("Choreografie-Moment: Refrain synchron oder als Kanon, Intro frei", async ({ page }) => {
    const canvas = page.locator("[data-testid=stage] canvas");
    await page.goto("/?demo=neonlicht&t=52000&qualitaet=niedrig");
    await ready(page);
    await expect(canvas).toHaveAttribute("data-moment", /^(synchron|kanon)$/);
    await page.goto("/?demo=neonlicht&t=1000&qualitaet=niedrig");
    await ready(page);
    await expect(canvas).toHaveAttribute("data-moment", "frei");
  });

  test("Countdown vor dem ersten Refrain: Blackout, Ziffer 1 auf dem letzten Schlag", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=39700&qualitaet=niedrig");
    await ready(page);
    await expect(page.getByTestId("countdown")).toHaveText("1");
    await page.goto("/?demo=neonlicht&t=30000&qualitaet=niedrig");
    await ready(page);
    await expect(page.getByTestId("countdown")).toHaveText("");
  });

  test("Ballade: Feuerzeuge statt Handys im Publikum", async ({ page }) => {
    await page.goto("/?demo=abendrot&t=5000&qualitaet=niedrig");
    await ready(page);
    await expect(page.locator("[data-testid=stage] canvas")).toHaveAttribute("data-crowd", "feuerzeuge");
  });

  test("Live-Bildschirme: eine zweite Kamera filmt die Sängerin", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=40150&qualitaet=hoch");
    await ready(page);
    await expect(page.locator("[data-testid=stage] canvas")).toHaveAttribute("data-screen", "saenger");
  });

  test("Wetter: Regen über dem Stadion (erzwungen), sonst trocken", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=46000&lyrics=karaoke&buehne=stadion&wetter=regen&qualitaet=mittel");
    await ready(page);
    await expect(page.locator("[data-weather=regen]")).toHaveCount(1);
    await expect(page).toHaveScreenshot("wetter-regen.png");
    await page.goto("/?demo=neonlicht&t=46000&buehne=stadion&qualitaet=niedrig");
    await ready(page);
    await expect(page.locator("[data-weather=kein]")).toHaveCount(1);
  });

  // Live (Zeit läuft): Szenen werden laufend aktualisiert – Fehler zeigen sich erst dabei, nicht im Standbild
  for (const q of ["demo=hoshizora", "demo=neonlicht&buehne=kathedrale", "demo=neonlicht&buehne=strand&wetter=regen"]) {
    test(`Live ohne Fehler: ${q}`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(`/?${q}&qualitaet=niedrig`);
      await ready(page);
      await page.waitForTimeout(6000);
      await expect(page.locator("[data-testid=stage] canvas")).toHaveCount(1);
      expect(errors).toEqual([]);
    });
  }

  // Übergang zwischen Songs – je Art ein eigener Test (bei 1920×1200 ohne GPU sprengen mehrere Seiten das Zeitlimit)
  for (const kind of ["umbau", "zugabe"] as const) {
    test(`Übergang zwischen Songs: ${kind} (erzwungen)`, async ({ page }) => {
      await page.goto(`/?demo=neonlicht&t=2000&uebergang=${kind}&qualitaet=niedrig`);
      await ready(page);
      await expect(page.getByTestId("song-transition")).toHaveAttribute("data-kind", kind);
      await expect(page).toHaveScreenshot(`uebergang-${kind}.png`);
    });
  }

  test("Motto läuft zum Songstart ein und blendet wieder aus", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=3000&qualitaet=niedrig");
    await ready(page);
    await expect(page.getByTestId("motto")).toHaveAttribute("data-visible", "true");
    await page.goto("/?demo=neonlicht&t=20000&qualitaet=niedrig");
    await ready(page);
    await expect(page.getByTestId("motto")).toHaveAttribute("data-visible", "false");
  });

  test("Mitsing-Moment im letzten Refrain: Einblendung, Kamera über die Köpfe", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=131000&qualitaet=niedrig");
    await ready(page);
    await expect(page.getByTestId("singalong")).toHaveAttribute("data-visible", "true");
    await expect(page.locator("[data-testid=stage] canvas")).toHaveAttribute("data-camera", /^ueberkopf/);
    await page.goto("/?demo=neonlicht&t=46000&qualitaet=niedrig");
    await ready(page);
    await expect(page.getByTestId("singalong")).toHaveAttribute("data-visible", "false");
  });

  test("Live-Bildschirme: auf niedriger Qualität aus", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=40150&qualitaet=niedrig");
    await ready(page);
    await expect(page.locator("[data-testid=stage] canvas")).not.toHaveAttribute("data-screen", /.+/);
  });

  // Publikum: Handylichter im ruhigen Outro, Springen mit Armbändern im Refrain
  const crowd = [
    { name: "publikum-handys", q: "demo=neonlicht&t=180000&buehne=festival", state: "handys" },
    { name: "publikum-refrain", q: "demo=neonlicht&t=52000&lyrics=karaoke&buehne=festival", state: "springen" },
  ] as const;
  for (const { name, q, state } of crowd) {
    test(`Publikum ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(`/?${q}&qualitaet=hoch`);
      await ready(page);
      await expect(page.locator("[data-testid=stage] canvas")).toHaveAttribute("data-crowd", state);
      await expect(page).toHaveScreenshot(`${name}.png`);
      expect(errors).toEqual([]);
    });
  }

  for (const [name, cast, theme] of [
    ["baer-bot-diva", "disco-baer,retro-bot,glitzer-diva", "club"],
    ["punk-alien-astro", "punk-rocker,kosmo-alien,astro-nova", "festival"],
  ] as const) {
    test(`Neue Avatare tanzen: ${name}`, async ({ page }) => {
      const errors = collectErrors(page);
      await page.goto(`/?demo=neonlicht&t=24000&avatare=${cast}&buehne=${theme}&qualitaet=hoch`);
      await ready(page);
      await expect(page.locator("[data-cast]")).toHaveAttribute("data-cast", cast);
      await expect(page).toHaveScreenshot(`avatare-${name}.png`);
      expect(errors).toEqual([]);
    });
  }

  test("Outfits: die Crew trägt den Look des Leads", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?demo=hoshizora&t=12000&qualitaet=hoch");
    await ready(page);
    await expect(page.locator("[data-outfits]")).toHaveAttribute("data-outfits", "eis,eis,eis");
    await expect(page).toHaveScreenshot("outfit-eis.png");
    // ohne Outfit bleibt das Original der Modelle
    await page.goto("/?demo=neonlicht&t=12000");
    await ready(page);
    await expect(page.locator("[data-outfits]")).toHaveAttribute("data-outfits", "original,original,original");
    expect(errors).toEqual([]);
  });

  test("Bühne lässt sich umschalten und bleibt gespeichert", async ({ page }) => {
    await page.goto("/?demo=neonlicht&t=46000");
    await expect(page.locator("[data-theme=festival]")).toBeVisible();
    await page.mouse.click(640, 300);
    const toggle = page.getByTestId("stage-toggle");
    await expect(toggle).toHaveText("Bühne: Auto");
    await tapControl(page, toggle);
    await expect(toggle).toHaveText("Bühne: Club");
    await expect(page.locator("[data-theme=club]")).toBeVisible();
    await page.reload();
    await expect(page.locator("[data-theme=club]")).toBeVisible();
  });

  test("Qualität und Strobe lassen sich umschalten und bleiben gespeichert", async ({ page }) => {
    await page.goto("/?demo=neonlicht");
    await expect(page.getByTestId("now-playing")).toBeVisible();
    const tap = (id: string) => tapControl(page, page.getByTestId(id));
    await page.mouse.click(640, 300);
    await expect(page.getByTestId("quality-toggle")).toHaveText("Qualität: Auto");
    await tap("quality-toggle");
    await expect(page.getByTestId("quality-toggle")).toHaveText("Qualität: Niedrig");
    await expect(page.locator("[data-quality=niedrig]")).toBeVisible();
    await tap("strobe-toggle");
    await expect(page.getByTestId("strobe-toggle")).toHaveText("Strobo aus");

    await page.reload();
    await expect(page.locator("[data-quality=niedrig]")).toBeVisible();
    await page.mouse.click(640, 300);
    await expect(page.getByTestId("strobe-toggle")).toHaveText("Strobo aus");
  });
});

test.describe("Robustheit der Bühne", () => {
  test("ohne WebGL: 2D-Hintergrund statt Absturz, Lyrics laufen weiter", async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      // WebGL nicht verfügbar (z. B. Grafiktreiber-Problem auf dem Pi)
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type.startsWith("webgl")) return null;
        return (orig as (...a: unknown[]) => RenderingContext | null).call(this, type, ...args);
      } as typeof orig;
    });
    await page.goto("/?demo=neonlicht&t=46000&lyrics=karaoke");
    await expect(page.getByTestId("stage-fallback")).toBeVisible();
    await expect(page.getByTestId("lyrics-current")).toHaveText("bis der Morgen uns zerbricht");
  });

  test("ein Avatar lädt nicht: die anderen tanzen weiter", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/avatars/atlas-prism.glb?*", (route) => route.abort());
    await page.goto("/?demo=neonlicht&t=46000&lyrics=karaoke");
    await ready(page);
    await expect(page.getByTestId("stage")).toBeVisible();
    await expect(page.getByTestId("stage-fallback")).toHaveCount(0);
    // Namensschild des fehlenden Avatars (Kai Vento) fehlt, das der anderen ist da
    await expect(page.getByTestId("name-tag")).toHaveText([/^Mira Sol/]);
    // nur der absichtlich provozierte Ladefehler, sonst nichts
    expect(errors.filter((e) => !/Could not load \/avatars\/atlas-prism\.glb/.test(e))).toEqual([]);
  });
});
