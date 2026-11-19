import { describe, expect, it } from "vitest";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { chorusKeyword, forcedWallPattern, keywordAmount, keywordShown, wallPattern, wallPatterns } from "@/lib/stage/wall";

const line = (text: string, startMs: number) => ({ text, startMs, endMs: startMs + 2000, words: [] });
const song = (genres: string[], trackKey = "t1") => ({ trackKey, music: { genres } });

describe("LED-Wand", () => {
  it("Muster nach Genre, ohne Genre wechselnd je Song und Tag", () => {
    expect(wallPattern(song(["techno"]))).toBe("tunnel");
    expect(wallPattern(song(["german rap"]))).toBe("equalizer");
    expect(wallPattern(song(["dance pop"]))).toBe("plasma");
    expect(wallPattern(song(["thrash metal"]))).toBe("wellen");
    // KI-Regie-Genres zählen zuerst
    expect(wallPattern({ ...song(["rock"]), show: { genres: ["deep house"] } } as never)).toBe("tunnel");
    const many = new Set(Array.from({ length: 24 }, (_, i) => wallPattern(song([], `song-${i}`))));
    expect(many.size).toBeGreaterThan(2);
    expect(wallPattern({ ...song([]), variant: "2026-11-19" })).toBe(wallPattern({ ...song([]), variant: "2026-11-19" }));
    for (const p of many) expect(wallPatterns).toContain(p);
  });

  it("Schlagwort: häufigstes aussagekräftiges Wort im Refrain", () => {
    const lyrics = {
      lines: [
        line("Ich gehe durch die Stadt", 0),
        line("Feuer in der Nacht, Feuer überall", 10_000),
        line("Wir sind das Feuer und die Nacht", 12_000),
        line("Strophe mit vielen anderen Worten Worten Worten", 30_000),
      ],
      sections: [
        { kind: "verse" as const, startMs: 0, endMs: 10_000 },
        { kind: "chorus" as const, startMs: 10_000, endMs: 20_000 },
        { kind: "verse" as const, startMs: 20_000, endMs: 40_000 },
      ],
    };
    expect(chorusKeyword(lyrics)).toBe("FEUER");
    // ohne Abschnitte: Zeilen, die sich wiederholen
    expect(
      chorusKeyword({
        lines: [line("Komm tanz mit mir", 0), line("Leuchtturm im Sturm", 1), line("Leuchtturm im Sturm", 2)],
        sections: [],
      }),
    ).toBe("LEUCHTTURM");
    // nur Füllwörter oder keine Lyrics: nichts
    expect(chorusKeyword({ lines: [line("oh oh yeah", 0)], sections: [{ kind: "chorus", startMs: 0, endMs: 5000 }] })).toBeNull();
    expect(chorusKeyword(null)).toBeNull();
    expect(chorusKeyword(neonlicht.lyrics)).toMatch(/^\p{Lu}{4,}$/u);
  });

  it("Schlagwort im Refrain taktgenau im Wechsel mit dem Muster", () => {
    // 120 BPM: ein Takt = 2 s, zwei Takte Wort, zwei Takte Muster
    expect([0, 3_900, 4_100, 7_900, 8_100].map((t) => keywordShown(t, 120, true))).toEqual([true, true, false, false, true]);
    expect(keywordShown(0, 120, false)).toBe(false);
    expect(keywordShown(0, 0, true)).toBe(false);
    // weiche Blende, rein aus der Songzeit (gleiche Zeit → gleiches Bild)
    expect([0, 125, 2000, 3875, 4000].map((t) => keywordAmount(t, 120, true))).toEqual([0, 0.5, 1, 0.5, 0]);
    expect(keywordAmount(2000, 120, true)).toBe(keywordAmount(2000, 120, true));
  });

  it("Muster per Adresse festlegen (Demo, Screenshots)", () => {
    expect(forcedWallPattern("?demo=neonlicht&wand=tunnel")).toBe("tunnel");
    expect(forcedWallPattern("?wand=kaputt")).toBeUndefined();
    expect(forcedWallPattern("")).toBeUndefined();
  });
});
