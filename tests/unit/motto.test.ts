import { describe, expect, it } from "vitest";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { abendrot } from "@/lib/song-context/fixtures/abendrot";
import { mottoFor } from "@/lib/show/motto";
import { buildSnapshot } from "@/lib/song-context/snapshot";

describe("Show-Motto", () => {
  it("KI-Motto geht vor", () => {
    const show = { stage: "club", mood: "energetisch", genres: [], motto: " Neonnacht über der Stadt ", sections: [] } as const;
    expect(mottoFor({ ...neonlicht, show: { ...show, genres: [], sections: [] } })).toBe("Neonnacht über der Stadt");
  });

  it("ohne KI: aus Stimmung und Titel, stabil je Song", () => {
    const m = mottoFor(neonlicht);
    expect(m).toContain("„Neonlicht“");
    expect(mottoFor(neonlicht)).toBe(m);
    // ruhiger Song bekommt ein ruhiges Motto
    const calm = mottoFor({ ...abendrot, music: { ...abendrot.music, mood: "ruhig" } });
    expect(calm).toMatch(/Lichter|nah|leiser|Tausend/);
  });

  it("Zusätze wie (Remastered) fallen weg", () => {
    const s = { ...neonlicht, track: { ...neonlicht.track, title: "Neonlicht (2024 Remastered Version)" } };
    expect(mottoFor(s)).toContain("„Neonlicht“");
  });

  it("steht im Schnappschuss für Alexa", () => {
    const snap = buildSnapshot(
      {
        song: neonlicht,
        playback: { isPlaying: true, positionMs: 0, updatedAt: 0 },
        positionMs: 0,
        derived: { section: null, activeSingerId: null } as never,
        live: { bpm: 124 } as never,
      } as never,
      null,
    );
    expect(snap?.motto).toBe(mottoFor(neonlicht));
  });
});
