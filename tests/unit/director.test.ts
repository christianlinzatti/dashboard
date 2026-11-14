import { describe, expect, it } from "vitest";
import { markBackground, planLyricsModes } from "@/lib/lyrics/director";
import { abendrot } from "@/lib/song-context/fixtures/abendrot";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { lastStartedIndex } from "@/lib/song-context/derive";

describe("LyricsDirector", () => {
  const modes = planLyricsModes(neonlicht);
  const sectionOf = (i: number) => {
    const secs = neonlicht.lyrics!.sections;
    return secs[lastStartedIndex(secs, neonlicht.lyrics!.lines[i]!.startMs)]!.kind;
  };

  it("ein Modus pro Zeile, innerhalb eines Abschnitts gleich", () => {
    expect(modes).toHaveLength(neonlicht.lyrics!.lines.length);
    for (let i = 1; i < modes.length; i++) if (sectionOf(i) === sectionOf(i - 1) && neonlicht.lyrics!.lines[i]!.startMs - neonlicht.lyrics!.lines[i - 1]!.endMs < 1000) expect(modes[i]).toBe(modes[i - 1]);
  });

  it("Refrains auffällig und abwechselnd, Strophen im Feature-Song als Duett", () => {
    const chorusModes = modes.filter((_, i) => sectionOf(i) === "chorus");
    expect(chorusModes.every((m) => m === "stapel" || m === "wortpop")).toBe(true);
    const perChorus = [...new Set(modes.map((m, i) => (sectionOf(i) === "chorus" ? `${neonlicht.lyrics!.sections.findIndex((s) => s.startMs <= neonlicht.lyrics!.lines[i]!.startMs && neonlicht.lyrics!.lines[i]!.startMs < s.endMs)}:${m}` : "")).filter(Boolean))];
    for (let i = 1; i < perChorus.length; i++) expect(perChorus[i]!.split(":")[1]).not.toBe(perChorus[i - 1]!.split(":")[1]);
    expect(modes.filter((_, i) => sectionOf(i) === "verse").every((m) => m === "duett" || m === "wortpop")).toBe(true);
    expect(modes.filter((_, i) => sectionOf(i) === "bridge").every((m) => m === "schreibmaschine")).toBe(true);
  });

  it("ohne Wort-Timing nur Karaoke; deterministisch", () => {
    expect(new Set(planLyricsModes(abendrot))).toEqual(new Set(["karaoke"]));
    expect(planLyricsModes(neonlicht)).toEqual(modes);
  });

  it("schnelle Parts werden Wort-Pop", () => {
    const fast = structuredClone(neonlicht);
    fast.track.isFeature = false;
    fast.lyrics!.lines = fast.lyrics!.lines.map((l) => (l.startMs >= 12_000 && l.startMs < 40_000 ? { ...l, text: `${l.text} und noch viel mehr Worte hier`, endMs: l.startMs + 1500 } : l));
    const m = planLyricsModes(fast);
    expect(m[0]).toBe("wortpop");
  });
});

describe("Background-Vocals", () => {
  it("markiert Wörter in Klammern", () => {
    const words = ["Ich", "geh", "(geh", "weiter)", "jetzt", "(oh)"].map((text) => ({ text }));
    expect(markBackground(words).map((w) => w.bg)).toEqual([false, false, true, true, false, true]);
  });
});
