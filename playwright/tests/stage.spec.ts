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
    // Bühne ohne Laufsteg (mit Laufsteg singt der Lead draußen auf der B-Bühne, eigener Test)
    await page.goto("/?demo=neonlicht&t=131000&qualitaet=niedrig&buehne=synthwave");
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
    ["cowboy-ritter-katze", "cowboy-joe,eisen-ritter,mietz-katze", "strand"],
    ["skelett-pinguin-mc", "knochen-kalle,frack-pinguin,mc-flow", "kathedrale"],
    ["tracht-disco-mariachi", "lederhosn-sepp,dirndl-vroni,disco-king", "festival"],
    ["weihnachts-crew", "weihnachtsmann,rentier,schneemann", "stadion"],
    ["dino-einhorn-ninja", "dino-rex,einhorn,ninja-nori", "club"],
    ["chibi-pixel-mika-kai", "chibi-pixel,chibi-mika,chibi-kai", "synthwave"],
    ["chibi-fuchsi-hana-tora", "chibi-fuchsi,chibi-hana,chibi-tora", "strand"],
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

  test("Freiluftbühnen nach Tageszeit: erzwungen per URL, Demos sonst mit gestaltetem Himmel", async ({ page }) => {
    await page.goto("/?demo=abendrot&t=50000&buehne=strand&tageszeit=nacht&qualitaet=niedrig");
    await ready(page);
    await expect(page.locator("[data-daylight]")).toHaveAttribute("data-daylight", "nacht");
    await page.goto("/?demo=abendrot&t=50000&buehne=strand&qualitaet=niedrig");
    await ready(page);
    await expect(page.locator("[data-daylight]")).toHaveAttribute("data-daylight", "gestaltet");
  });

  test("Spotify Canvas ersetzt die 3D-Bühne, HUD liegt darüber", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/?demo=neonlicht&t=46000&canvas=/demo/pulsar.svg&lyrics=karaoke");
    await page.locator("[data-testid=canvas-background]").waitFor();
    await ready(page, false);
    // keine 3D-Bühne gemountet
    await expect(page.locator("[data-testid=stage]")).toHaveCount(0);
    await expect(page.getByTestId("now-playing")).toBeVisible();
    await expect(page).toHaveScreenshot("canvas-hintergrund.png");
    expect(errors).toEqual([]);
  });

  test("Spotify Canvas auf der LED-Wand der Bühne statt Wandfoto und Logo", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/?demo=neonlicht&t=150000&canvas=/demo/canvas.svg&canvasort=buehne&buehne=club&qualitaet=mittel");
    await ready(page);
    await expect(page.locator("[data-testid=canvas-background]")).toHaveCount(0);
    await expect(page.locator("[data-wall-canvas]")).toHaveAttribute("data-wall-canvas", "image");
    await expect(page.getByTestId("wall-photo-credit")).toHaveCount(0);
    await expect(page).toHaveScreenshot("canvas-leinwand.png");
    // Bühnen ohne LED-Wand: kein Canvas, Bühne wie sonst
    await page.goto("/?demo=neonlicht&t=46000&canvas=/demo/canvas.svg&canvasort=buehne&buehne=jazz&qualitaet=niedrig");
    await ready(page);
    await expect(page.locator("[data-theme]")).toHaveAttribute("data-theme", "jazz");
    await expect(page.locator("[data-wall-canvas]")).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("Canvas-Datei nur mit Anmeldung und gültiger Track-ID", async ({ request }) => {
    expect((await request.get("/api/canvas/video?track=4uLU6hMCjMI75M1A2tKUQC")).status()).toBe(401);
    expect((await request.get("/api/canvas/video?track=../../etc")).status()).toBe(401);
  });

  test("Große Auftritte: Hubpodest, Spannungsaufbau, Laufsteg mit B-Bühne, Drohnen-Show", async ({ page }) => {
    const errors = collectErrors(page);
    const canvas = page.locator("[data-testid=stage] canvas");
    // erster Song des Abends: der Lead fährt aus dem Boden
    await page.goto("/?demo=neonlicht&t=2200&buehne=club&qualitaet=mittel");
    await ready(page);
    await expect(page.locator("[data-evening]")).toHaveAttribute("data-evening", "auftakt");
    // Aufbau vor dem ersten großen Einsatz: Licht, Kamera und Publikum ziehen sich zusammen
    await page.goto("/?demo=neonlicht&t=36000&buehne=club&qualitaet=mittel");
    await ready(page);
    await expect(canvas).toHaveAttribute("data-scene", "aufbau");
    await expect(canvas).toHaveAttribute("data-camera", "aufbau");
    await expect(page).toHaveScreenshot("aufbau.png");
    // letzter Refrain: der Lead draußen auf der B-Bühne, Luftschlangen über der Menge
    await page.goto("/?demo=neonlicht&t=134000&buehne=festival&qualitaet=mittel");
    await ready(page);
    await expect(canvas).toHaveAttribute("data-runway", "draussen");
    await expect(canvas).toHaveAttribute("data-camera", "bbuehne");
    await expect(canvas).toHaveAttribute("data-fx", /luftschlangen/);
    await expect(page).toHaveScreenshot("laufsteg-b-buehne.png");
    // Outro unter freiem Himmel: Drohnen formen ein Herz
    await page.goto("/?demo=neonlicht&t=155000&buehne=festival&qualitaet=mittel");
    await ready(page);
    await expect(canvas).toHaveAttribute("data-drones", "herz");
    await expect(canvas).toHaveAttribute("data-camera", "himmel");
    await expect(page).toHaveScreenshot("drohnen-herz.png");
    // drinnen keine Drohnen
    await page.goto("/?demo=neonlicht&t=155000&buehne=club&qualitaet=niedrig");
    await ready(page);
    await expect(canvas).not.toHaveAttribute("data-drones", /.+/);
    expect(errors).toEqual([]);
  });

  test("Publikum: Wasserbälle, Circle-Pit, Handkamera aus der ersten Reihe", async ({ page }) => {
    const canvas = page.locator("[data-testid=stage] canvas");
    await page.goto("/?demo=neonlicht&t=48000&buehne=strand&qualitaet=mittel");
    await ready(page);
    await expect(canvas).toHaveAttribute("data-crowd-props", /baelle/);
    await page.goto("/?demo=funkenflug&t=50000&buehne=club&qualitaet=niedrig");
    await ready(page);
    await expect(canvas).toHaveAttribute("data-crowd", "circlepit");
    await page.goto("/?demo=neonlicht&t=70000&buehne=club&qualitaet=niedrig");
    await ready(page);
    await expect(canvas).toHaveAttribute("data-camera", "fan");
  });

  test("Avatar-Stil „nur Chibis“: alle Figuren auf der Bühne sind Chibis", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/?demo=neonlicht&t=24000&stil=chibi&buehne=festival&qualitaet=hoch");
    await ready(page);
    const cast = (await page.locator("[data-cast]").getAttribute("data-cast"))!.split(",");
    expect(cast.length).toBeGreaterThanOrEqual(3);
    for (const id of cast) expect(id).toMatch(/^chibi-/);
    await expect(page).toHaveScreenshot("avatar-stil-chibi.png");
    expect(errors).toEqual([]);
  });

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

  test("Band-Solo im Instrumentalteil: Gitarre, dann Schlagzeug im Verfolger", async ({ page }) => {
    await page.goto("/?demo=funkenflug&t=47000&qualitaet=mittel");
    await ready(page);
    const canvas = page.locator("[data-testid=stage] canvas");
    await expect(canvas).toHaveAttribute("data-solo", "gitarre");
    await expect(canvas).toHaveAttribute("data-camera", "solo");
    await expect(page).toHaveScreenshot("band-solo.png");
    await page.goto("/?demo=funkenflug&t=61000&qualitaet=mittel");
    await ready(page);
    await expect(canvas).toHaveAttribute("data-solo", "schlagzeug");
  });
});
