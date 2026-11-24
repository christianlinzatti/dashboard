import { describe, expect, it } from "vitest";
import { planChoreography } from "@/lib/dance/plan";
import {
  CUT_BARS,
  cutBarsFor,
  ENTRANCE_BARS,
  EXIT_BARS,
  FAREWELL_CLIP,
  STAGE_CLIPS,
  WALK_CLIP,
  bowAngleAt,
  cameraAt,
  entranceAt,
  exitAt,
  headingAt,
  layersAt,
  positionsAt,
  shotAt,
} from "@/lib/dance/evaluate";
import { mixamoIdsIn } from "@/lib/dance/mixamo-loader";
import { mixamoFileById } from "@/lib/dance/mixamo";
import { crowdAt, crowdProfile } from "@/lib/stage/crowd";
import { abendrot } from "@/lib/song-context/fixtures/abendrot";
import { instrumental } from "@/lib/song-context/fixtures/instrumental";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { fixtures } from "@/lib/song-context/fixtures";
import { sanitizeBrief } from "@/lib/show/brief";

const c = planChoreography(neonlicht, 124);
const noFocus = { timeline: [], avatarOf: () => undefined };

describe("Auftritt und Abgang", () => {
  it("die Crew kommt nacheinander von der Seite, der Lead zuletzt – dann stehen alle am Platz", () => {
    const lead = c.order[0]!;
    const crew = c.order[1]!;
    expect(entranceAt(c, crew, 0)).toBe(0);
    expect(entranceAt(c, crew, c.barMs)).toBeGreaterThan(entranceAt(c, lead, c.barMs));
    expect(entranceAt(c, lead, ENTRANCE_BARS * c.barMs)).toBe(1);
    const start = positionsAt(c, 1, noFocus);
    for (const id of c.order) expect(Math.abs(start[id]![0])).toBeGreaterThan(5); // hinter der Bühne
    const after = positionsAt(c, ENTRANCE_BARS * c.barMs + 1, noFocus);
    const planned = c.phrases[0]!.positions;
    for (const id of c.order) expect(after[id]![0]).toBeCloseTo(planned[id]![0], 1);
  });

  it("beim Gehen Gehen-Clip und Blick in Gehrichtung, am Ziel zum Publikum", () => {
    const crew = c.order[1]!;
    expect(layersAt(c, crew, c.barMs * 0.5).map((l) => l.clip)).toEqual([WALK_CLIP]);
    const x = c.phrases[0]!.positions[crew]![0];
    expect(Math.abs(headingAt(c, crew, c.barMs * 0.5, x))).toBeCloseTo(Math.PI / 2);
    expect(headingAt(c, crew, ENTRANCE_BARS * c.barMs + 1, x)).toBe(0);
  });

  it("am Ende: erst gemeinsam winken, dann verbeugen", () => {
    const end = c.durationMs;
    expect(exitAt(c, end - EXIT_BARS * c.barMs - 10)).toBeNull();
    expect(exitAt(c, end - 1.5 * c.barMs)?.phase).toBe("winken");
    expect(layersAt(c, c.order[0]!, end - 1.2 * c.barMs).map((l) => l.clip)).toEqual([FAREWELL_CLIP]);
    expect(exitAt(c, end - 0.5 * c.barMs)?.phase).toBe("verbeugen");
    expect(bowAngleAt(c, end - 0.55 * c.barMs)).toBeGreaterThan(0.6);
    expect(bowAngleAt(c, end - 1.5 * c.barMs)).toBe(0);
  });

  it("Gehen und Winken werden mitgeladen, obwohl sie nicht getanzt werden", () => {
    for (const id of STAGE_CLIPS) {
      expect(mixamoFileById.has(id)).toBe(true);
      expect(mixamoIdsIn(c)).toContain(id);
    }
  });
});

describe("Kamera wie ein Konzertmitschnitt", () => {
  const all = Object.values(fixtures).map((s) => planChoreography(s, s.music.bpmHint ?? 120));
  it("bei hoher Energie Schnitte im 4-Takt-Raster zwischen zwei stehenden Einstellungen", () => {
    // (Mitsing-Moment und Nahaufnahme beim großen Einsatz ausgenommen – eigene Tests)
    const withCut = all.flatMap((k) =>
      k.phrases.filter((p) => p.cut).map((p) => ({ k: { ...k, singAlong: null, climaxes: [] }, p })),
    );
    expect(withCut.length).toBeGreaterThan(0);
    for (const { k, p } of withCut) {
      expect(p.energy).toBeGreaterThanOrEqual(2);
      expect(p.turn).toBe(false);
      expect(shotAt(k, p.startMs + 10)).toBe(p.camera);
      const bars = cutBarsFor(p);
      expect(bars).toBe(p.section === "chorus" && p.energy >= 3 ? 2 : CUT_BARS);
      expect(shotAt(k, p.startMs + bars * k.barMs + 10)).toBe(p.cut);
      // harter Schnitt: direkt nach dem Wechsel schon die neue Einstellung
      const t = p.startMs + bars * k.barMs + 5;
      const before = cameraAt(k, t - 10);
      const after = cameraAt(k, t);
      expect(Math.hypot(...after.pos.map((v, i) => v - before.pos[i]!))).toBeGreaterThan(0.3);
    }
  });

  it("aus dem Publikum über die Köpfe (ueberkopf) nur im Refrain/Instrumental", () => {
    const k = planChoreography(instrumental, 132);
    for (const p of k.phrases.filter((p) => p.camera === "ueberkopf")) expect(["chorus", "instrumental"]).toContain(p.section);
  });
});

describe("Publikum nach Stil", () => {
  it("Rock: Moshpit im Refrain; Ballade: Feuerzeuge statt Handys", () => {
    const rock = planChoreography({ ...neonlicht, music: { ...neonlicht.music, genres: ["punk rock"] } }, 124);
    expect(rock.crowdStyle).toBe("rock");
    const chorus = rock.phrases.find((p) => p.section === "chorus")!;
    expect(crowdAt(rock, chorus.startMs + 3 * rock.barMs).mosh).toBe(1);
    expect(crowdAt(rock, 1000).mosh).toBe(0);

    const ballad = planChoreography(abendrot, 84);
    expect(ballad.crowdStyle).toBe("ballade");
    const calm = crowdAt(ballad, 5000);
    expect(calm.phones).toBeGreaterThan(0.5);
    expect(calm.lighter).toBe(1);
    expect(c.crowdStyle).toBeNull(); // Pop: Handys bleiben Handys
  });

  it("die Regie (KI) kann Moshpit und Feuerzeuge anweisen", () => {
    expect(crowdProfile({ section: "verse", energy: 1, crowd: "moshpit" }).mosh).toBe(1);
    expect(crowdProfile({ section: "verse", energy: 1, crowd: "feuerzeuge" }).lighter).toBe(1);
    const brief = {
      stage: "club",
      mood: "mittel",
      genres: [],
      motto: "x",
      sections: [{ kind: "chorus", energy: "hoch", lyrics: "neon", crowd: "moshpit", effects: [] }],
    };
    expect(sanitizeBrief(brief)?.sections[0]?.crowd).toBe("moshpit");
  });
});

describe("Konzertfilm: Eröffnung und Einsätze", () => {
  const all = Object.values(fixtures).map((s) => planChoreography(s, s.music.bpmHint ?? 120));
  it("Songstart: Drohnenflug von hoch hinter dem Publikum auf die erste Einstellung", async () => {
    const { OPENING_BARS } = await import("@/lib/dance/evaluate");
    const k = all[0]!;
    const len = Math.min(OPENING_BARS * k.barMs, 8000);
    const start = cameraAt(k, 0);
    expect(start.pos[1]).toBeGreaterThan(6); // hoch
    expect(start.pos[2]).toBeGreaterThan(18); // hinter der Menge
    const mid = cameraAt(k, len / 2);
    expect(mid.pos[2]).toBeLessThan(start.pos[2]);
    // danach ohne Sprung in der normalen Einstellung
    const end = cameraAt(k, len + 1);
    const before = cameraAt(k, len - 30);
    expect(Math.hypot(...end.pos.map((v, i) => v - before.pos[i]!))).toBeLessThan(0.3);
  });

  it("großer Einsatz mit Countdown: einen Takt nah auf den Sänger, das Finale behält seinen Kameraflug", () => {
    const withBig = all.find((k) => k.climaxes.some((c) => c.countdown && !c.finale));
    expect(withBig).toBeDefined();
    const hit = withBig!.climaxes.find((c) => c.countdown && !c.finale)!;
    expect(shotAt({ ...withBig!, singAlong: null }, hit.atMs + 10)).toBe("nah");
    expect(shotAt({ ...withBig!, singAlong: null }, hit.atMs + withBig!.barMs + 10)).not.toBe("nah");
    const finale = withBig!.climaxes.find((c) => c.finale);
    if (finale) expect(shotAt({ ...withBig!, singAlong: null }, finale.atMs + 10)).not.toBe("nah");
  });
});

describe("Band-Solo im Instrumentalteil", () => {
  it("Rock: erst Gitarre, dann Schlagzeug; Kamera nah; Solist tritt nach vorn und wieder zurück", async () => {
    const { soloAt, SOLO_STEP } = await import("@/lib/stage/musicians");
    const plans = Object.values(fixtures).map((s) =>
      planChoreography({ ...s, music: { ...s.music, genres: ["rock"] } }, s.music.bpmHint ?? 120),
    );
    const solos = plans.flatMap((k) => k.phrases.filter((p) => p.solo).map((p) => ({ k, p })));
    expect(solos.length).toBeGreaterThan(0);
    for (const { p } of solos) {
      expect(p.section).toBe("instrumental");
      expect(p.energy).toBeGreaterThanOrEqual(2);
      expect(p.camera).toBe("nah");
      expect(p.turn).toBe(false);
    }
    const first = plans.find((k) => k.phrases.some((p) => p.solo))!;
    expect(first.phrases.find((p) => p.solo)!.solo).toBe("gitarre");
    const { k, p } = solos[0]!;
    expect(soloAt(k, p.startMs)!.w).toBe(0);
    expect(soloAt(k, p.startMs + k.beatMs * 2)).toMatchObject({ role: p.solo, w: 1 });
    expect(soloAt(k, p.endMs - 1)!.w).toBeLessThan(0.01);
    expect(SOLO_STEP).toBeGreaterThan(0);
  });

  it("ohne Band (kein passendes Genre) kein Solo; Jazz: Keyboard", () => {
    const none = Object.values(fixtures).map((s) =>
      planChoreography(
        { ...s, music: { ...s.music, genres: ["schlager"] }, artists: s.artists.map((a) => ({ ...a, genres: [] })) },
        120,
      ),
    );
    expect(none.every((k) => k.phrases.every((p) => !p.solo))).toBe(true);
    const jazz = Object.values(fixtures).map((s) => planChoreography({ ...s, music: { ...s.music, genres: ["jazz"] } }, 120));
    const roles = new Set(jazz.flatMap((k) => k.phrases.flatMap((p) => (p.solo ? [p.solo] : []))));
    expect([...roles].every((r) => r === "keyboard")).toBe(true);
  });
});
