import { describe, expect, it } from "vitest";
import { avatars, commonClips, timeScaleFor } from "@/lib/avatars/catalog";
import { avatarForArtist, buildCast, preferredAvatars } from "@/lib/avatars/casting";

describe("Avatar-Katalog", () => {
  it("kennt alle 11 Avatare und die 20 gemeinsamen Clips", () => {
    expect(avatars).toHaveLength(11);
    expect(commonClips).toHaveLength(20);
    expect(commonClips).toContain("Dance_Groove");
    expect(commonClips).toContain("Idle_Breathe");
  });

  it.each([
    [120, 1],
    [90, 0.75],
    [150, 1.25],
    [200, 200 / 240],
    [60, 1],
  ])("Tempo %d BPM → timeScale %f", (bpm, expected) => {
    expect(timeScaleFor(bpm)).toBeCloseTo(expected);
  });
});

describe("Casting", () => {
  it("bevorzugt genre-passende Avatare", () => {
    expect(preferredAvatars(["hard rock"])[0]).toBe("ember-rock");
    expect(preferredAvatars(["vocal jazz"])[0]).toBe("velvet-jazz");
    expect(avatarForArtist("x", ["reggaeton"])).toMatch(/rio-carnival|sol-groove/);
  });

  it("gibt einem Artist immer denselben Avatar", () => {
    expect(avatarForArtist("artist-123", [])).toBe(avatarForArtist("artist-123", []));
  });

  it("Feature-Song: ein Tänzer pro Artist, Lead in der Mitte", () => {
    const cast = buildCast({
      trackKey: "t1",
      genres: ["pop"],
      size: 2,
      artists: [
        { spotifyId: "a", avatarId: "aurora-synth", role: "main" },
        { spotifyId: "b", avatarId: "atlas-prism", role: "feature" },
        { spotifyId: "c", avatarId: "atlas-prism", role: "feature" }, // Kollision → anderer Avatar
      ],
    });
    expect(cast).toHaveLength(3);
    expect(cast[0]).toMatchObject({ avatarId: "aurora-synth", role: "lead", position: 0 });
    expect(new Set(cast.map((c) => c.avatarId)).size).toBe(3);
    expect(cast.filter((c) => c.role === "feature")).toHaveLength(2);
  });

  it("füllt mit Background-Tänzern auf und hält die Obergrenze ein", () => {
    const solo = buildCast({ trackKey: "t2", genres: ["techno"], size: 3, artists: [{ spotifyId: "a", avatarId: "neon-pulse", role: "main" }] });
    expect(solo).toHaveLength(3);
    expect(solo.slice(1).every((c) => c.role === "backup")).toBe(true);

    const many = Array.from({ length: 8 }, (_, i) => ({ spotifyId: `a${i}`, avatarId: avatars[i]!.id, role: "feature" as const }));
    expect(buildCast({ trackKey: "t3", genres: [], artists: many, maxSize: 5 })).toHaveLength(5);
  });

  it("ist pro Song deterministisch", () => {
    const input = { trackKey: "same", genres: [], artists: [{ spotifyId: "a", avatarId: "luna-flow", role: "main" as const }] };
    expect(buildCast(input)).toEqual(buildCast(input));
  });
});
