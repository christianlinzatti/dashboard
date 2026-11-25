import { describe, expect, it } from "vitest";
import { fixtures } from "@/lib/song-context/fixtures";
import { planChoreography, type Choreography } from "@/lib/dance/plan";
import { cameraAt, entranceAt, headingAt, heightAt, layersAt, positionsAt, shotAt, WALK_CLIP } from "@/lib/dance/evaluate";
import {
  B_STAGE_Z,
  BUILD_BARS,
  DRONE_BARS,
  LIFT_DEPTH,
  NO_STAGING,
  buildAt,
  droneShotAt,
  dronesAt,
  dronesFit,
  dronesFor,
  runwayFor,
  heartPoint,
  liftFor,
  liftGlowAt,
  liftHeightAt,
  planBuilds,
  planDrones,
  planRunway,
  planStaging,
  runwayAt,
  runwayPoint,
} from "@/lib/stage/staging";
import { THEMES } from "@/lib/stage/themes";
import { lightsAt } from "@/lib/stage/lights";
import { crowdAt, crowdProfile } from "@/lib/stage/crowd";
import { BALLS, HEAD_Y, SURF_MS, ballAt, surferAt } from "@/lib/stage/crowd-props";
import { planEffects } from "@/lib/stage/effects";

const song = fixtures.neonlicht!;
const base = planChoreography(song, 124);
const staged = (theme = THEMES.festival, phase: "auftakt" | "zugabe" | "steigerung" = "zugabe"): Choreography => ({
  ...base,
  staging: planStaging(base, theme, phase, undefined),
});
const focus = { timeline: [], avatarOf: () => undefined };
const lightInput = (t: number) => ({ t, anchorMs: null, dropMs: null, energy: 0.5, micActive: false, strobeAllowed: true });

describe("Laufsteg mit B-Bühne", () => {
  const c = staged();
  const r = c.staging!.runway!;
  const finale = base.climaxes.find((k) => k.finale)!;

  it("nur auf großen Bühnen; hinaus zum letzten Refrain, zurück vor dessen Ende und vor dem Abgang", () => {
    expect(planRunway(base, "jazz")).toBeNull();
    expect(planRunway(base, "strand")).toBeNull();
    expect(r.outStartMs).toBe(finale.atMs);
    expect(r.outEndMs - r.outStartMs).toBeCloseTo(2 * base.barMs);
    expect(r.backEndMs - r.backStartMs).toBeCloseTo(2 * base.barMs);
    expect(r.backEndMs).toBeLessThanOrEqual(base.durationMs - 2 * base.barMs);
    // ohne Finale kein Laufsteg
    expect(planRunway({ ...base, climaxes: [] }, "club")).toBeNull();
    // zu kurzer Refrain: draußen bliebe keine Zeit
    expect(planRunway({ ...base, durationMs: finale.atMs + 5 * base.barMs }, "club")).toBeNull();
  });

  it("Phasen: hin, draußen, zurück", () => {
    expect(runwayAt(r, r.outStartMs - 1)).toBeNull();
    expect(runwayAt(r, (r.outStartMs + r.outEndMs) / 2)).toMatchObject({ phase: "hin" });
    expect(runwayAt(r, r.outEndMs + 10)).toEqual({ u: 1, phase: "draussen" });
    expect(runwayAt(r, r.backStartMs + 10)?.phase).toBe("zurueck");
    expect(runwayAt(r, r.backEndMs)).toBeNull();
    expect(runwayAt(null, 0)).toBeNull();
  });

  it("Weg über die Bühnenmitte auf die B-Bühne", () => {
    expect(runwayPoint([1.5, 0.5], 0)).toEqual([1.5, 0.5]);
    expect(runwayPoint([1.5, 0.5], 1)).toEqual([0, B_STAGE_Z]);
    // nach gut einem Drittel ist er auf der Mittelachse (betritt den Steg gerade)
    expect(runwayPoint([1.5, 0.5], 0.35)[0]).toBeCloseTo(0);
  });

  it("der Lead geht hinaus (Gehen), steht draußen, dreht sich für den Rückweg um", () => {
    const lead = c.order[0]!;
    const out = positionsAt(c, r.outEndMs + 1000, focus)[lead]!;
    expect(out[1]).toBeCloseTo(B_STAGE_Z);
    // die anderen bleiben auf der Bühne
    for (const id of c.order.slice(1)) expect(positionsAt(c, r.outEndMs + 1000, focus)[id]![1]).toBeLessThan(4);
    expect(layersAt(c, lead, (r.outStartMs + r.outEndMs) / 2)[0]!.clip).toBe(WALK_CLIP);
    expect(layersAt(c, lead, r.outEndMs + 1000).some((l) => l.clip === WALK_CLIP)).toBe(false);
    expect(headingAt(c, lead, (r.backStartMs + r.backEndMs) / 2, 0)).toBeCloseTo(Math.PI);
    expect(headingAt(c, lead, r.backEndMs - 1, 0)).toBeLessThan(0.1);
  });

  it("Kamera: über den Lead in die Menge im Wechsel mit der Nahaufnahme, auf dem Rückweg von der B-Bühne", () => {
    expect(shotAt(c, r.outEndMs + 10)).toBe("bbuehne");
    expect(shotAt(c, r.outEndMs + 4 * c.barMs + 10)).toBe("nah");
    expect(shotAt(c, r.backStartMs + 10)).toBe("laufsteg");
    for (const t of [r.outEndMs + 10, r.backStartMs + 10]) {
      const cam = cameraAt(c, t, [0, B_STAGE_Z]);
      expect(cam.pos.every(Number.isFinite)).toBe(true);
    }
  });
});

describe("Große Auftritte nur zu besonderen Momenten des Abends", () => {
  it("Laufsteg bei Höhepunkt und Zugabe, Drohnen nur zur Zugabe", () => {
    expect(runwayFor("hoehepunkt")).toBe(true);
    expect(runwayFor("zugabe")).toBe(true);
    expect(runwayFor("steigerung")).toBe(false);
    expect(runwayFor(undefined)).toBe(false);
    expect(dronesFor("zugabe")).toBe(true);
    expect(dronesFor("hoehepunkt")).toBe(false);
    const normal = staged(THEMES.festival, "steigerung").staging!;
    expect(normal.runway).toBeNull();
    expect(normal.drones).toBeNull();
    // der Spannungsaufbau gehört zu jedem großen Einsatz
    expect(normal.builds.length).toBeGreaterThan(0);
  });
});

describe("Hubpodest", () => {
  it("Auftakt hoch, Zugabe runter, sonst nichts", () => {
    expect(liftFor("auftakt")).toBe("hoch");
    expect(liftFor("zugabe")).toBe("runter");
    expect(liftFor("steigerung")).toBeNull();
    expect(liftFor(undefined)).toBeNull();
  });

  it("hoch: startet unter der Bühne, ist nach zwei Takten oben; der Lead kommt nicht von der Seite", () => {
    const c = staged(THEMES.club, "auftakt");
    const lead = c.order[0]!;
    expect(heightAt(c, lead, 0)).toBeCloseTo(-LIFT_DEPTH);
    expect(heightAt(c, lead, c.barMs)).toBeGreaterThan(-LIFT_DEPTH);
    expect(heightAt(c, lead, 2 * c.barMs)).toBe(0);
    expect(heightAt(c, c.order[1]!, 0)).toBe(0);
    expect(entranceAt(c, lead, 100)).toBe(1);
    expect(entranceAt(c, c.order[1]!, 100)).toBeLessThan(1);
    expect(liftGlowAt(c, "hoch", 100)).toBe(1);
    expect(liftGlowAt(c, "hoch", 2.5 * c.barMs)).toBeCloseTo(0.5);
    expect(liftGlowAt(c, "hoch", 4 * c.barMs)).toBe(0);
    expect(liftGlowAt(c, null, 100)).toBe(0);
  });

  it("runter: im letzten Takt (Verbeugung) hinab", () => {
    const c = staged(THEMES.club, "zugabe");
    expect(liftHeightAt(c, "runter", c.durationMs - 2 * c.barMs)).toBe(0);
    expect(liftHeightAt(c, "runter", c.durationMs)).toBeCloseTo(-LIFT_DEPTH);
    expect(liftGlowAt(c, "runter", c.durationMs - 2 * c.barMs)).toBe(0);
    expect(liftGlowAt(c, "runter", c.durationMs - 1)).toBe(1);
    expect(liftHeightAt(c, null, 0)).toBe(0);
  });
});

describe("Spannungsaufbau", () => {
  const c = staged(THEMES.club);
  const builds = c.staging!.builds;

  it("vier Takte vor jedem Countdown-Einsatz, endet mit dem Blackout", () => {
    const countdowns = base.climaxes.filter((k) => k.countdown);
    expect(builds.length).toBe(countdowns.length);
    builds.forEach((b, i) => {
      expect(b.endMs).toBeCloseTo(countdowns[i]!.atMs - base.barMs);
      expect(b.endMs - b.startMs).toBeCloseTo(BUILD_BARS * base.barMs);
    });
    // bekannte Drops zählen mit, ganz am Songanfang nicht
    const withDrop = planBuilds({ ...base, climaxes: [], knownDrops: [1000, 60_000] });
    expect(withDrop).toEqual([{ startMs: 60_000 - BUILD_BARS * base.barMs, endMs: 60_000 }]);
    // zwei Einsätze kurz hintereinander: nur ein Aufbau
    expect(planBuilds({ ...base, climaxes: [], knownDrops: [60_000, 62_000] })).toHaveLength(1);
  });

  it("Licht, Kamera und Publikum ziehen mit", () => {
    const b = builds[0]!;
    const mid = (b.startMs + b.endMs) / 2;
    expect(buildAt(c, mid)).toBeCloseTo(0.5);
    expect(buildAt(c, b.startMs - 1)).toBe(0);
    expect(buildAt({}, mid)).toBe(0);
    expect(shotAt(c, mid)).toBe("aufbau");
    const near = cameraAt(c, b.endMs - 10, [0, 0]);
    const far = cameraAt(c, b.startMs + 10, [0, 0]);
    expect(near.pos[2]).toBeLessThan(far.pos[2]); // fährt heran
    const lf = lightsAt(song, c, 8, lightInput(b.endMs - 50));
    expect(lf.scene).toBe("aufbau");
    expect(lf.lasers.on).toBe(false);
    expect(lf.signal.brightness).toBeGreaterThan(0.8);
    expect(lightsAt(song, c, 8, lightInput(b.startMs + 10)).signal.brightness).toBeLessThan(0.4);
    // die Lampen ziehen hoch, die Kegel schwenken zur Mitte
    expect(lf.heads[0]!.y).toBeGreaterThan(0);
    expect(Math.abs(lf.heads[0]!.pan)).toBeLessThan(0.2);
    expect(crowdAt(c, b.endMs - 50).hands).toBeGreaterThan(0.85);
  });
});

describe("Bewegliche Lichttraversen", () => {
  it("ruhige Teile tief und wogend, Refrain oben", () => {
    const c = { ...base, staging: NO_STAGING };
    const intro = lightsAt(song, c, 8, lightInput(2000));
    expect(intro.scene).toBe("intro");
    expect(Math.max(...intro.heads.map((h) => h.y))).toBeLessThan(-0.7);
    // Welle: nicht alle Lampen gleich hoch
    expect(new Set(intro.heads.map((h) => h.y.toFixed(3))).size).toBeGreaterThan(1);
    const chorus = base.phrases.find((p) => p.section === "chorus" && p.energy >= 2)!;
    const refrain = lightsAt(song, c, 8, lightInput(chorus.startMs + 3 * base.barMs));
    expect(refrain.heads.every((h) => h.y === 0)).toBe(true);
  });
});

describe("Drohnen-Show", () => {
  it("nur draußen und nicht bei Tag", () => {
    expect(dronesFit(THEMES.festival, undefined)).toBe(true);
    expect(dronesFit(THEMES.strand, "nacht")).toBe(true);
    expect(dronesFit(THEMES.stadion, "tag")).toBe(false);
    expect(dronesFit(THEMES.club, undefined)).toBe(false);
    expect(staged(THEMES.club).staging!.drones).toBeNull();
  });

  it("im Outro, höchstens 16 Takte, vor dem Abgang", () => {
    const d = planDrones(base)!;
    const outro = base.phrases.find((p) => p.section === "outro")!;
    expect(d.startMs).toBe(outro.startMs);
    expect(d.endMs - d.startMs).toBeLessThanOrEqual(DRONE_BARS * base.barMs + 1);
    expect(d.endMs).toBeLessThanOrEqual(base.durationMs - 2 * base.barMs);
    // ohne Outro: die letzten Takte vor dem Abgang; zu kurz: keine Show
    const noOutro = { ...base, phrases: base.phrases.filter((p) => p.section !== "outro") };
    expect(planDrones(noOutro)!.endMs).toBeCloseTo(base.durationMs - 2 * base.barMs);
    expect(planDrones({ ...base, durationMs: 4 * base.barMs, phrases: [], climaxes: [] })).toBeNull();
  });

  it("Schwarm, Herz, Wort; die Kamera schaut in den Himmel (mit einem Blick zurück)", () => {
    const d = { startMs: 0, endMs: 10_000 };
    expect(dronesAt(d, -1).formation).toBe("aus");
    expect(dronesAt(null, 5).formation).toBe("aus");
    expect(dronesAt(d, 1000)).toMatchObject({ formation: "schwarm", level: 1 });
    expect(dronesAt(d, 400).level).toBeCloseTo(0.5);
    expect(dronesAt(d, 4000).formation).toBe("herz");
    expect(dronesAt(d, 8000)).toMatchObject({ formation: "wort", w: 1 });
    expect(dronesAt(d, 11_000).level).toBeCloseTo(0.5);
    expect(droneShotAt(d, 2000)).toBe(true);
    expect(droneShotAt(d, 5000)).toBe(false);
    expect(droneShotAt(d, 7000)).toBe(true);
    expect(droneShotAt(d, 9800)).toBe(false);
    const c = staged(THEMES.festival);
    expect(shotAt(c, c.staging!.drones!.startMs + 10)).toBe("himmel");
  });

  it("Herz: symmetrisch, Einheitsgröße", () => {
    const n = 40;
    for (let i = 1; i < n / 2; i++) {
      const [x1, y1] = heartPoint(i, n);
      const [x2, y2] = heartPoint(n - i, n);
      expect(x1).toBeCloseTo(-x2);
      expect(y1).toBeCloseTo(y2);
    }
    for (let i = 0; i < n; i++) expect(Math.hypot(...heartPoint(i, n))).toBeLessThan(1.1);
  });
});

describe("Publikum: Circle-Pit, Crowdsurfer, Wasserbälle, Armbänder", () => {
  it("Rock: Circle-Pit im Instrumentalteil, Crowdsurfer im Refrain; fröhlich: Bälle im Refrain", () => {
    expect(crowdProfile({ section: "instrumental", energy: 2 }, "rock")).toMatchObject({ circle: 1, wave: 0 });
    expect(crowdProfile({ section: "chorus", energy: 2 }, "rock")).toMatchObject({ mosh: 1, surf: 1 });
    expect(crowdProfile({ section: "verse", energy: 3 }, "rock").surf).toBe(0);
    expect(crowdProfile({ section: "chorus", energy: 2 }).balls).toBe(1);
    expect(crowdProfile({ section: "chorus", energy: 2 }, "ballade").balls).toBe(0);
  });

  it("Armbänder: Ringe im Refrain, Farbfelder beim Mitsingen", () => {
    expect(crowdProfile({ section: "chorus", energy: 2 }).bandMode).toBe(4);
    const sing = base.singAlong!;
    expect(crowdAt(base, (sing.startMs + sing.endMs) / 2).bandMode).toBe(3);
  });

  it("Bälle springen über den Köpfen, Surfer werden zur Bühne getragen", () => {
    for (let i = 0; i < BALLS; i++)
      for (const t of [0, 3333, 77_777]) {
        const [, y, z] = ballAt(i, t);
        expect(y).toBeGreaterThan(HEAD_Y);
        expect(z).toBeGreaterThan(6);
      }
    const a = surferAt(0, 1000);
    const b = surferAt(0, 6000);
    expect(b.pos[2]).toBeLessThan(a.pos[2]);
    expect(surferAt(0, 0).visible).toBe(0);
    expect(surferAt(0, SURF_MS / 2).visible).toBe(1);
  });
});

describe("Handkamera und Luftschlangen", () => {
  it("die Handkamera ist eine zweite Einstellung in Strophen", () => {
    const fans = base.phrases.filter((p) => p.cut === "fan");
    expect(fans.length).toBeGreaterThan(0);
    for (const p of fans) expect(p.section).toBe("verse");
    const p = fans[0]!;
    const c = { ...base, staging: NO_STAGING, singAlong: null };
    expect(shotAt(c, p.startMs + 4 * base.barMs + 10)).toBe("fan");
    expect(cameraAt(c, p.startMs + 4 * base.barMs + 10, [0, 0]).pos[1]).toBeLessThan(1);
  });

  it("Luftschlangen vier Takte nach dem Einsatz des letzten Refrains, nur wo es Kanonen gibt", () => {
    const finale = base.climaxes.find((k) => k.finale)!;
    const cues = planEffects(base, THEMES.club);
    expect(cues.filter((q) => q.kind === "luftschlangen").map((q) => q.startMs)).toEqual([finale.atMs + 4 * base.barMs]);
    expect(planEffects(base, THEMES.jazz).some((q) => q.kind === "luftschlangen")).toBe(false);
  });
});
