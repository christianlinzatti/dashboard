import { describe, expect, it } from "vitest";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { weatherFor } from "@/lib/stage/weather";

const song = (title: string, opts: { genres?: string[]; mood?: "ruhig" | "mittel" | "energetisch"; key?: string } = {}) => ({
  ...neonlicht,
  trackKey: opts.key ?? "t1",
  track: { ...neonlicht.track, title },
  music: { ...neonlicht.music, genres: opts.genres ?? [], mood: opts.mood },
});

describe("Wetter", () => {
  it("Schnee bei Winter- und Weihnachtssongs, Regen bei Regen-Songs", () => {
    expect(weatherFor(song("Last Christmas"), "stadion", "2026-07-01")).toBe("schnee");
    expect(weatherFor(song("Schneeflöckchen"), "festival", "2026-07-01")).toBe("schnee");
    expect(weatherFor(song("November Rain"), "festival", "2026-07-01")).toBe("regen");
    expect(weatherFor(song("Purple Rain"), "stadion", "2026-07-01")).toBe("regen");
  });

  it("nur unter freiem Himmel; am Strand kein Schnee", () => {
    for (const t of ["club", "jazz", "lagerhalle", "kathedrale", "weltraum"] as const)
      expect(weatherFor(song("Purple Rain"), t, "2026-07-01")).toBeNull();
    expect(weatherFor(song("Last Christmas"), "strand", "2026-12-20")).toBeNull();
    expect(weatherFor(song("Rain on the Beach"), "strand", "2026-07-01")).toBe("regen");
  });

  it("keine Fehltreffer durch Wortteile", () => {
    expect(weatherFor(song("Leise Reise"), "festival", "2026-07-01")).toBeNull();
    expect(weatherFor(song("Night Train"), "festival", "2026-07-01")).toBeNull();
  });

  it("Winter: im Dezember schneit es manchmal, im Sommer nie von selbst; deterministisch", () => {
    const keys = Array.from({ length: 40 }, (_, i) => `k${i}`);
    const dec = keys.map((k) => weatherFor(song("Neonlicht", { key: k }), "stadion", "2026-12-12"));
    expect(dec.filter((w) => w === "schnee").length).toBeGreaterThan(3);
    expect(dec.filter((w) => w === "schnee").length).toBeLessThan(30);
    expect(dec).toEqual(keys.map((k) => weatherFor(song("Neonlicht", { key: k }), "stadion", "2026-12-12")));
    const jul = keys.map((k) => weatherFor(song("Neonlicht", { key: k, mood: "energetisch" }), "stadion", "2026-07-12"));
    expect(jul.every((w) => w === null)).toBe(true);
    // ruhige Songs: gelegentlich Regen
    const calm = keys.map((k) => weatherFor(song("Neonlicht", { key: k, mood: "ruhig" }), "festival", "2026-07-12"));
    expect(calm.some((w) => w === "regen")).toBe(true);
  });
});
