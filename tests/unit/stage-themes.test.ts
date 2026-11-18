import { describe, expect, it } from "vitest";
import { planChoreography } from "@/lib/dance/plan";
import { settingsPatchFor } from "@/lib/live/commands";
import { abendrot } from "@/lib/song-context/fixtures/abendrot";
import { instrumental } from "@/lib/song-context/fixtures/instrumental";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { commandSchema } from "@/lib/song-context/snapshot";
import { dropCues, effectsAt, LINGER_MS, planEffects, type Cue } from "@/lib/stage/effects";
import { lightsAt, type LightInput } from "@/lib/stage/lights";
import { isThemeChoice, mixHex, THEMES, themedPalette, themeFor, themeIds } from "@/lib/stage/themes";

const song = (genres: string[], trackKey = "t1") => ({ ...neonlicht, trackKey, music: { ...neonlicht.music, genres } });

describe("Bühnen-Themen", () => {
  it("wählt nach Genre", () => {
    expect(themeFor(song(["smooth jazz"]))).toBe("jazz");
    expect(themeFor(song(["soul"]))).toBe("jazz");
    expect(themeFor(song(["j-pop"]))).toBe("synthwave");
    expect(themeFor(song(["synthwave"]))).toBe("synthwave");
    expect(themeFor(song(["ambient"]))).toBe("weltraum");
    expect(themeFor(song(["minimal techno"]))).toBe("club");
    expect(themeFor(song(["german hip hop"]))).toBe("festival");
    expect(themeFor(song(["hard rock"]))).toBe("festival");
  });

  it("Genres der Künstler zählen mit, feste Wahl schlägt alles", () => {
    const s = { ...song([]), artists: neonlicht.artists.map((a) => ({ ...a, genres: ["blues"] })) };
    expect(themeFor(s)).toBe("jazz");
    expect(themeFor(s, "weltraum")).toBe("weltraum");
  });

  it("ohne Genre: wechselnd pro Song, aber stabil", () => {
    const keys = Array.from({ length: 24 }, (_, i) => `track-${i}`);
    const plain = (k: string) => ({ ...song([], k), artists: neonlicht.artists.map((a) => ({ ...a, genres: [] })) });
    const picked = keys.map((k) => themeFor(plain(k)));
    expect(new Set(picked).size).toBeGreaterThanOrEqual(3);
    expect(picked).toEqual(keys.map((k) => themeFor(plain(k))));
    expect(picked).not.toContain("jazz");
  });

  it("Themenfarben färben die Cover-Palette ein", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#fff", "#000000", 0)).toBe("#ffffff");
    expect(mixHex("kaputt", "#ffffff", 1)).toBe("#ffffff");
    const p = neonlicht.album.palette;
    expect(themedPalette(p, THEMES.club)).toBe(p);
    const syn = themedPalette(p, THEMES.synthwave);
    expect(syn.accent).not.toBe(p.accent);
    expect(syn.light).toBe(p.light);
  });

  it("erkennt gültige Auswahl", () => {
    expect(themeIds.every(isThemeChoice)).toBe(true);
    expect(isThemeChoice("auto")).toBe(true);
    expect(isThemeChoice("disco")).toBe(false);
  });
});

describe("Effekt-Regie", () => {
  const plan = planChoreography(neonlicht, 124);
  const cues = planEffects(plan, THEMES.festival);
  const chorusStarts = plan.phrases.filter((p, i) => p.section === "chorus" && plan.phrases[i - 1]?.section !== "chorus");

  it("deterministisch und nur erlaubte Effekte", () => {
    expect(planEffects(plan, THEMES.festival)).toEqual(cues);
    for (const id of themeIds) {
      const allowed = new Set(THEMES[id].effects);
      expect(planEffects(plan, THEMES[id]).every((c) => allowed.has(c.kind))).toBe(true);
    }
  });

  it("jeder Refrain startet mit einem Knall", () => {
    for (const p of chorusStarts)
      expect(cues.some((c) => c.startMs === p.startMs && ["pyro", "co2", "funken"].includes(c.kind))).toBe(true);
  });

  it("Konfetti: kurzer Schuss beim ersten großen Einsatz, große Kanonen im Finale, dazu Feuerwerk", () => {
    const [first, last] = [chorusStarts[0]!, chorusStarts.at(-1)!];
    const konfetti = cues.filter((c) => c.kind === "konfetti");
    expect(konfetti.map((c) => c.startMs)).toEqual([first.startMs, last.startMs]);
    expect(konfetti[0]!.intensity).toBeLessThan(konfetti[1]!.intensity);
    expect(cues.find((c) => c.kind === "feuerwerk")!.startMs).toBeGreaterThan(last.startMs);
    // verschossenes Konfetti schwebt nach dem Ausstoß noch
    expect(effectsAt(konfetti.slice(0, 1), first.startMs + 5000).map((c) => c.kind)).toEqual(["konfetti"]);
  });

  it("Schaumparty im vorletzten Refrain – nur auf Bühnen mit Schaumkanonen", () => {
    const foam = cues.filter((c) => c.kind === "schaum");
    expect(foam.map((c) => c.startMs)).toEqual([chorusStarts.at(-2)!.startMs]);
    expect(foam[0]!.durationMs).toBe(4 * plan.barMs);
    expect(planEffects(plan, THEMES.club).some((c) => c.kind === "schaum")).toBe(true);
    expect(planEffects(plan, THEMES.weltraum).some((c) => c.kind === "schaum")).toBe(false);
    // nicht zugleich mit dem Konfetti-Schuss
    expect(cues.some((c) => c.kind === "konfetti" && c.startMs === foam[0]!.startMs)).toBe(false);
  });

  it("Schaum auf Wunsch der Regie und nie bei nur einem Refrain von selbst", () => {
    const single = planChoreography(abendrot, 84);
    expect(planEffects(single, THEMES.club).some((c) => c.kind === "schaum")).toBe(false);
    const directed = {
      ...single,
      phrases: single.phrases.map((p) => (p.section === "chorus" ? { ...p, effects: ["schaum" as const] } : p)),
    };
    expect(planEffects(directed, THEMES.club).filter((c) => c.kind === "schaum")).toHaveLength(1);
  });

  it("ohne Refrain: Finale im letzten energiereichen Instrumentalteil", () => {
    const p = planChoreography(instrumental, 132);
    const club = planEffects(p, THEMES.club);
    expect(club.filter((c) => c.kind === "konfetti" && c.intensity === 1)).toHaveLength(1);
    expect(club.some((c) => c.kind === "ringe")).toBe(true);
  });

  it("Jazz bleibt ruhig: Spiegelkugel statt Pyro", () => {
    const jazz = planEffects(planChoreography(abendrot, 84), THEMES.jazz);
    expect(new Set(jazz.map((c) => c.kind))).toEqual(new Set(["glitzer", "funken"]));
  });

  it("aktive Effekte inkl. Nachflug, neueste zuerst", () => {
    const q: Cue[] = [
      { kind: "pyro", startMs: 1000, durationMs: 2000, intensity: 1, seed: 1 },
      { kind: "co2", startMs: 2000, durationMs: 1000, intensity: 1, seed: 2 },
    ];
    expect(effectsAt(q, 500)).toEqual([]);
    expect(effectsAt(q, 2500).map((c) => [c.kind, c.ageMs])).toEqual([
      ["co2", 500],
      ["pyro", 1500],
    ]);
    expect(effectsAt(q, 3000 + LINGER_MS.pyro - 1).map((c) => c.kind)).toContain("pyro");
    expect(effectsAt(q, 3000 + LINGER_MS.pyro + 1).map((c) => c.kind)).not.toContain("pyro");
    const extra = dropCues(2600, plan, THEMES.festival);
    expect(extra.map((c) => c.kind).sort()).toEqual(["co2", "flammen", "funken", "pyro"]);
    expect(dropCues(0, plan, THEMES.jazz).map((c) => c.kind)).toEqual(["funken"]);
    expect(effectsAt(q, 2700, extra)[0]!.startMs).toBe(2600);
  });
});

describe("Thema im Licht und als Befehl", () => {
  const plan = planChoreography(neonlicht, 124);
  const base: LightInput = { t: 46_000, anchorMs: null, dropMs: null, energy: 0, micActive: false, strobeAllowed: true };

  it("Jazz dimmt die Moving Heads und schaltet Laser ab", () => {
    const full = lightsAt(neonlicht, plan, 4, base);
    const jazz = lightsAt(neonlicht, plan, 4, { ...base, headLevel: 0.5, lasers: false });
    expect(full.lasers.on).toBe(true);
    expect(jazz.lasers.on).toBe(false);
    expect(jazz.heads[1]!.intensity).toBeCloseTo(full.heads[1]!.intensity * 0.5);
  });

  it("Bühnen-Befehl (Alexa) ändert die Einstellung", () => {
    expect(settingsPatchFor({ type: "buehne", value: "weltraum" })).toEqual({ stage: "weltraum" });
    expect(settingsPatchFor({ type: "buehne", value: "disco" })).toBeNull();
    expect(commandSchema.safeParse({ type: "buehne", value: "jazz" }).success).toBe(true);
    expect(commandSchema.safeParse({ type: "buehne", value: "disco" }).success).toBe(false);
  });
});
