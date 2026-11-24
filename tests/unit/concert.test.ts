import { describe, expect, it } from "vitest";
import { cameraAt } from "@/lib/dance/evaluate";
import { planChoreography } from "@/lib/dance/plan";
import { rng } from "@/lib/dance/rng";
import { lyricsEffects, planLyricsEffects } from "@/lib/lyrics/director";
import { abendrot } from "@/lib/song-context/fixtures/abendrot";
import { hoshizora } from "@/lib/song-context/fixtures/hoshizora";
import { instrumental } from "@/lib/song-context/fixtures/instrumental";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { crowdAt, crowdProfile, crowdSpots } from "@/lib/stage/crowd";
import { dropCues, planEffects } from "@/lib/stage/effects";
import { PRESETS } from "@/lib/stage/quality";
import { THEMES, themeIds } from "@/lib/stage/themes";

const plan = planChoreography(neonlicht, 124);
const phraseOf = (section: string) => plan.phrases.find((p) => p.section === section)!;
const mid = (p: { startMs: number; endMs: number }) => (p.startMs + p.endMs) / 2;

describe("Publikums-Regie", () => {
  it("ruhige Teile: Handylichter; Refrain: Hände oben, Springen, Armbänder pulsieren", () => {
    expect(crowdProfile({ section: "intro", energy: 0 })).toMatchObject({ phones: 0.8, jump: 0 });
    expect(crowdProfile({ section: "bridge", energy: 2 }).phones).toBeGreaterThan(0.8);
    const chorus = crowdProfile({ section: "chorus", energy: 3 });
    expect(chorus).toMatchObject({ jump: 1, phones: 0, bands: 1, bandMode: 1 });
    expect(chorus.hands).toBeGreaterThan(0.8);
    expect(crowdProfile({ section: "verse", energy: 2 }).bandMode).toBe(2);
    expect(crowdProfile({ section: "verse", energy: 1 }).jump).toBe(0);
  });

  it("Klatschen über dem Kopf: bei mittlerer Energie von selbst, auf Anweisung der Regie stärker", () => {
    expect(crowdProfile({ section: "verse", energy: 2 }).clap).toBeGreaterThan(0.3);
    expect(crowdProfile({ section: "verse", energy: 1 }).clap).toBe(0);
    expect(crowdProfile({ section: "chorus", energy: 3 }).clap).toBe(0);
    expect(crowdProfile({ section: "verse", energy: 1, crowd: "klatschen" }).clap).toBeGreaterThan(0.6);
    // Klatscher und Hände-oben sind verschiedene Leute: zusammen nie mehr als alle
    const k = crowdProfile({ section: "verse", energy: 1, crowd: "klatschen" });
    expect(k.clap + k.hands).toBeLessThanOrEqual(1);
  });

  it("La-Ola: in Instrumentalteilen mit Schwung und auf Anweisung, die Kamera geht dafür in die Totale", () => {
    expect(crowdProfile({ section: "instrumental", energy: 3 }).wave).toBe(1);
    expect(crowdProfile({ section: "instrumental", energy: 1 }).wave).toBe(0);
    expect(crowdProfile({ section: "chorus", energy: 3 }).wave).toBe(0);
    expect(crowdProfile({ section: "verse", energy: 1, crowd: "welle" }).wave).toBe(1);
    // Rock: im lauten Instrumentalteil lieber Moshpit
    expect(crowdProfile({ section: "instrumental", energy: 3 }, "rock")).toMatchObject({ mosh: 1 });
    const c = planChoreography(instrumental, 132);
    const wave = c.phrases.filter((p) => crowdAt(c, mid(p)).wave > 0.5);
    expect(wave.length).toBeGreaterThan(0);
    for (const p of wave.filter((x) => !x.turn)) expect([p.camera, p.cut]).toContain("totale");
  });

  it("folgt dem Song, deterministisch, mit weichem Übergang", () => {
    const chorus = phraseOf("chorus");
    expect(crowdAt(plan, mid(chorus)).jump).toBe(1);
    expect(crowdAt(plan, 3000).phones).toBeGreaterThan(0.5);
    expect(crowdAt(plan, mid(chorus))).toEqual(crowdAt(plan, mid(chorus)));
    // ein Takt nach Refrainbeginn: zwischen Strophe und Refrain
    const half = crowdAt(plan, chorus.startMs + plan.barMs);
    expect(half.hands).toBeGreaterThan(crowdAt(plan, chorus.startMs - 10).hands);
    expect(half.hands).toBeLessThan(crowdAt(plan, mid(chorus)).hands);
    expect(crowdAt(plan, -5)).toBeDefined();
  });

  it("Drop (Mikrofon): für zwei Takte alles auf Anschlag", () => {
    const verse = phraseOf("verse");
    const t = mid(verse);
    const calm = crowdAt(plan, t);
    const drop = crowdAt(plan, t, { dropMs: t - plan.beatMs });
    expect(drop.hands).toBeGreaterThan(calm.hands);
    expect(drop.jump).toBeCloseTo(1, 1);
    expect(crowdAt(plan, t, { dropMs: t - 3 * plan.barMs })).toEqual(calm);
  });

  it("Plätze: vor der Bühne, nie auf dem Podest, wiederholbar; Anzahl je Qualität und Bühne", () => {
    const spots = crowdSpots(400, rng("publikum").next);
    expect(spots).toEqual(crowdSpots(400, rng("publikum").next));
    let front = 0;
    for (let i = 0; i < 400; i++) {
      const [x, z, scale] = [spots[i * 7]!, spots[i * 7 + 1]!, spots[i * 7 + 2]!];
      const r = Math.hypot(x, z);
      expect(r).toBeGreaterThanOrEqual(4.9);
      expect(r).toBeLessThanOrEqual(13.01);
      expect(scale).toBeGreaterThan(0.85);
      // nie direkt hinter der Bühne (dort steht die Rückwand)
      expect(Math.abs(Math.atan2(x, z))).toBeLessThanOrEqual((115 * Math.PI) / 180 + 1e-6);
      if (r < 8) front++;
    }
    expect(front).toBeGreaterThan(160); // dicht an der Bühnenkante
    expect(PRESETS.niedrig.crowd).toBeLessThan(PRESETS.mittel.crowd);
    expect(PRESETS.mittel.crowd).toBeLessThan(PRESETS.hoch.crowd);
    for (const id of themeIds) expect(THEMES[id].crowd).toBeGreaterThan(0);
    expect(THEMES.festival.crowd).toBeGreaterThan(THEMES.jazz.crowd);
  });
});

describe("Flammen", () => {
  it("auf jeden Taktanfang bei höchster Energie – nicht im Jazz-Keller", () => {
    const cues = planEffects(plan, THEMES.festival).filter((c) => c.kind === "flammen");
    const peak = plan.phrases.filter((p) => p.energy >= 3);
    expect(cues.length).toBeGreaterThan(peak.length * 3);
    for (const c of cues) {
      const p = plan.phrases.find((q) => c.startMs >= q.startMs && c.startMs < q.endMs)!;
      expect(p.energy).toBe(3);
      const bars = (c.startMs - p.startMs) / plan.barMs;
      expect(Math.abs(bars - Math.round(bars))).toBeLessThan(1e-6);
    }
    expect(planEffects(planChoreography(abendrot, 84), THEMES.jazz).some((c) => c.kind === "flammen")).toBe(false);
    expect(planEffects(planChoreography(instrumental, 132), THEMES.club).some((c) => c.kind === "flammen")).toBe(true);
    expect(dropCues(1000, plan, THEMES.festival).map((c) => c.kind)).toContain("flammen");
  });
});

describe("Schrift-Effekte der Lyrics", () => {
  const sectionOf = (song: typeof neonlicht, i: number) =>
    song.lyrics!.sections.find((s) => song.lyrics!.lines[i]!.startMs >= s.startMs && song.lyrics!.lines[i]!.startMs < s.endMs)
      ?.kind;

  it("Strophen glühen, Refrains wechseln zwischen auffälligen Effekten", () => {
    const fx = planLyricsEffects(neonlicht);
    expect(fx).toHaveLength(neonlicht.lyrics!.lines.length);
    expect(fx.every((e) => lyricsEffects.includes(e))).toBe(true);
    expect(planLyricsEffects(neonlicht)).toEqual(fx);
    const byKind = new Map<string, Set<string>>();
    fx.forEach((e, i) => {
      const k = sectionOf(neonlicht, i) ?? "?";
      byKind.set(k, (byKind.get(k) ?? new Set()).add(e));
    });
    expect([...byKind.get("verse")!].every((e) => e === "gluehen" || e === "glitch")).toBe(true);
    const chorus = byKind.get("chorus")!;
    expect(chorus.has("gluehen")).toBe(false);
    expect(chorus.size).toBeGreaterThanOrEqual(2); // mehrere Refrains → Abwechslung
    // erster Refrain: Leit-Effekt
    const first = fx[neonlicht.lyrics!.lines.findIndex((_, i) => sectionOf(neonlicht, i) === "chorus")];
    expect(first).toBe("feuer");
    expect([...byKind.get("bridge")!]).toEqual(["echo"]);
  });

  it("Bühne gibt die Richtung vor: Jazz ohne Feuer und Glitch, Synthwave beginnt mit Neon", () => {
    const warm = planLyricsEffects(neonlicht, "warm");
    expect(warm).not.toContain("feuer");
    expect(warm).not.toContain("glitch");
    const neon = planLyricsEffects(hoshizora, "neon");
    const firstChorus = neon[hoshizora.lyrics!.lines.findIndex((_, i) => sectionOf(hoshizora, i) === "chorus")];
    expect(firstChorus).toBe("neon");
    expect(planLyricsEffects(abendrot)).not.toContain("feuer"); // ruhige Stimmung
    expect(planLyricsEffects(instrumental)).toEqual([]);
  });
});

describe("Totale mit Tele-Optik", () => {
  it("steht hinter den ersten Reihen, erhöht, enger Bildwinkel; Zoom öffnet zum Normalwinkel", () => {
    const totale = plan.phrases.find((p) => p.camera === "totale")!;
    const cam = cameraAt(plan, totale.endMs - 10);
    expect(cam.pos[2]).toBeGreaterThan(9);
    expect(cam.pos[1]).toBeGreaterThan(2);
    expect(cam.fov).toBeCloseTo(24, 0);
    const p2 = planChoreography(hoshizora, 132);
    // Zoom öffnet über die Phrase (die Drohnen-Eröffnung der ersten 8 s ausgenommen – eigener Test)
    // dafür die Phrasen um 20 s nach hinten schieben (der Zoom liegt sonst ganz in der Eröffnung)
    const shift = 20_000;
    const later = {
      ...p2,
      climaxes: [],
      phrases: p2.phrases.map((p) => ({ ...p, startMs: p.startMs + shift, endMs: p.endMs + shift })),
    };
    const zoom = later.phrases.find((p) => p.camera === "zoom")!;
    expect(cameraAt(later, zoom.startMs + 50).fov).toBeLessThan(26);
    expect(cameraAt(later, zoom.endMs - 1).fov).toBeGreaterThan(35);
    for (let t = 0; t < 150_000; t += 2500) expect(Number.isFinite(cameraAt(p2, t).fov)).toBe(true);
  });
});
