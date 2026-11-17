import { describe, expect, it } from "vitest";
import { momentFor, planChoreography, type Phrase } from "@/lib/dance/plan";
import { IDLE_CLIP } from "@/lib/dance/clips";
import { fixtures } from "@/lib/song-context/fixtures";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { sanitizeBrief, type ShowBrief } from "@/lib/show/brief";
import { themeFor } from "@/lib/stage/themes";
import { previousTheme, recentClipsKey, setlistStore } from "@/lib/stage/setlist";

const clipsOf = (p: Phrase) => Object.values(p.moves).map((m) => m.clip);
const plans = Object.values(fixtures).map((s) => planChoreography(s, s.music.bpmHint ?? 120));
const all = plans.flatMap((c) => c.phrases.map((p) => ({ c, p })));

describe("Choreografie-Momente", () => {
  it("synchron: alle tanzen denselben Clip im selben Takt", () => {
    const sync = all.filter(({ p }) => p.moment === "synchron");
    expect(sync.length).toBeGreaterThan(0);
    for (const { p } of sync) {
      expect(new Set(clipsOf(p)).size).toBe(1);
      expect(Object.values(p.moves).every((m) => m.offsetBeats === 0)).toBe(true);
      expect(p.sync).toBe(true);
    }
  });

  it("Kanon: derselbe Clip als Welle von links nach rechts, je Platz ein Schlag später", () => {
    const kanon = all.filter(({ p }) => p.moment === "kanon");
    expect(kanon.length).toBeGreaterThan(0);
    for (const { c, p } of kanon) {
      expect(new Set(clipsOf(p)).size).toBe(1);
      const byX = [...c.order].sort((a, b) => p.positions[a]![0] - p.positions[b]![0]);
      expect(byX.map((id) => p.moves[id]!.offsetBeats)).toEqual(byX.map((_, i) => i));
    }
  });

  it("Solo: Lead im Spot, Crew hält still, Kamera nah dran, keine Drehbühne", () => {
    const solo = all.filter(({ p }) => p.moment === "solo");
    expect(solo.length).toBeGreaterThan(0);
    for (const { c, p } of solo) {
      expect(p.formation).toBe("spotlight");
      expect(["nah", "halbnah", "zoom"]).toContain(p.camera);
      expect(p.turn).toBe(false);
      expect(p.moves[c.order[0]!]!.clip).not.toBe(IDLE_CLIP);
      for (const id of c.order.slice(1)) expect(p.moves[id]!.clip).toBe(IDLE_CLIP);
    }
  });

  it("Refrain beginnt synchron, das Intro bleibt frei (Winken)", () => {
    for (const c of plans) {
      const firstChorus = c.phrases.find((p, i) => p.section === "chorus" && c.phrases[i - 1]?.section !== "chorus");
      if (firstChorus) expect(firstChorus.moment).toBe("synchron");
      expect(c.phrases[0]!.moment).toBe("frei");
    }
  });

  it("Regie (KI) setzt den Moment der ersten Phrase, spätere variieren", () => {
    const r = { next: () => 0.1 };
    expect(momentFor("verse", 1, 0, r, "solo")).toBe("solo");
    expect(momentFor("verse", 1, 1, r, "solo")).toBe("frei");
    expect(momentFor("chorus", 2, 1, r, "synchron")).toBe("kanon");
    expect(momentFor("bridge", 1, 0, r, "kanon")).toBe("kanon");
    const brief: ShowBrief = {
      stage: "club",
      mood: "mittel",
      genres: [],
      motto: "x",
      sections: [{ kind: "verse", energy: "mittel", lyrics: "neon", crowd: "wiegen", effects: [], moment: "solo" }],
    };
    const c = planChoreography({ ...neonlicht, show: brief }, 124);
    const firstVerse = c.phrases.find((p) => p.section === "verse")!;
    expect(firstVerse.moment).toBe("solo");
  });

  it("ältere Briefs ohne Moment bleiben gültig (Cache)", () => {
    const old = {
      stage: "club",
      mood: "mittel",
      genres: [],
      motto: "x",
      sections: [{ kind: "verse", energy: "mittel", lyrics: "neon", crowd: "wiegen", effects: [] }],
    };
    expect(sanitizeBrief(old)?.sections[0]?.moment).toBeUndefined();
  });
});

describe("Gedächtnis des Abends", () => {
  it("Tänze der letzten Songs werden seltener gewählt", () => {
    const base = planChoreography(neonlicht, 124);
    const used = new Set(base.phrases.flatMap(clipsOf));
    const next = planChoreography(neonlicht, 124, { avoidClips: used });
    const count = (c: typeof base) => c.phrases.flatMap(clipsOf).filter((x) => used.has(x) && x !== IDLE_CLIP).length;
    expect(count(next)).toBeLessThan(count(base));
    // ohne Gedächtnis bleibt alles wie bisher (deterministisch)
    expect(planChoreography(neonlicht, 124, { avoidClips: new Set() })).toEqual(base);
  });

  it("nicht zweimal hintereinander dieselbe Bühne – Jazz bleibt Jazz", () => {
    const song = { trackKey: "t1", music: { genres: ["techno"] }, artists: [] } as unknown as Parameters<typeof themeFor>[0];
    expect(themeFor(song)).toBe("club");
    expect(["synthwave", "weltraum", "festival"]).toContain(themeFor(song, "auto", "club"));
    expect(themeFor(song, "auto", "festival")).toBe("club");
    expect(themeFor(song, "club", "club")).toBe("club"); // feste Wahl gilt
    const jazz = { ...song, music: { genres: ["jazz"] } } as typeof song;
    expect(themeFor(jazz, "auto", "jazz")).toBe("jazz");
  });

  it("Setlist merkt sich Songs, ohne den aktuellen als „vorigen“ zu zählen", () => {
    const s = setlistStore.getState();
    s.reset();
    s.record({ trackKey: "a", theme: "club", clips: ["x", "y"] });
    s.record({ trackKey: "b", theme: "festival", clips: ["z"] });
    s.record({ trackKey: "b", theme: "festival", clips: ["z", "w"] }); // neu geplant → ersetzt
    const { played } = setlistStore.getState();
    expect(played.map((p) => p.trackKey)).toEqual(["a", "b"]);
    expect(previousTheme(played, "b")).toBe("club");
    expect(previousTheme(played, "c")).toBe("festival");
    expect(recentClipsKey(played, "c")).toBe("w,x,y,z");
    expect(recentClipsKey(played, "b")).toBe("x,y");
    s.reset();
  });
});
