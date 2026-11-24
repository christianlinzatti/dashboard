import { describe, expect, it } from "vitest";
import { SIGN_TILES, signTexts } from "@/lib/stage/fan-signs";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";

describe("Fan-Schilder", () => {
  it("Künstler, Titel, Heimatort, Zugabe – höchstens acht, keine zu langen", () => {
    const t = signTexts({ ...neonlicht, concertArea: { name: "Wien", radiusKm: 200 } });
    expect(t).toContain("♥ Mira Sol ♥");
    expect(t).toContain("MIRA SOL");
    expect(t).toContain("„Neonlicht“");
    expect(t).toContain("Wien ♥ Mira Sol");
    expect(t).toContain("ZUGABE!");
    expect(t).toContain("Kai Vento ♥");
    expect(t.length).toBeLessThanOrEqual(SIGN_TILES);
    expect(t.every((x) => x.length <= 22)).toBe(true);
  });
  it("ohne Heimatort „Wir ♥ …“; sehr lange Titel fallen weg; ohne Künstler keine Schilder", () => {
    const long = signTexts({ ...neonlicht, track: { ...neonlicht.track, title: "Ein sehr, sehr langer Songtitel ohne Ende" } });
    expect(long).toContain("Wir ♥ Mira Sol");
    expect(long.some((x) => x.includes("langer"))).toBe(false);
    expect(signTexts({ ...neonlicht, artists: [] })).toEqual([]);
  });
});
