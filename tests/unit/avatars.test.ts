import { describe, expect, it } from "vitest";
import { avatars, commonClips, timeScaleFor } from "@/lib/avatars/catalog";
import { avatarForArtist, buildCast, preferredAvatars } from "@/lib/avatars/casting";

describe("Avatar-Katalog", () => {
  it("kennt alle 23 Avatare und die 20 gemeinsamen Clips", () => {
    expect(avatars).toHaveLength(23);
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
    expect(preferredAvatars(["punk"])[0]).toBe("punk-rocker");
    expect(preferredAvatars(["space ambient"])).toEqual(["astro-nova", "kosmo-alien", "retro-bot"]);
    expect(preferredAvatars(["vocal jazz"])[0]).toBe("velvet-jazz");
    expect(preferredAvatars(["disco"])[0]).toBe("glitzer-diva");
    expect(preferredAvatars(["country"])[0]).toBe("cowboy-joe");
    expect(preferredAvatars(["k-pop"])[0]).toBe("mietz-katze");
    expect(preferredAvatars(["death metal"])[0]).toBe("knochen-kalle");
    expect(preferredAvatars(["german hip hop"])[0]).toBe("mc-flow");
    expect(preferredAvatars(["classical"])[0]).toBe("frack-pinguin");
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
    const solo = buildCast({
      trackKey: "t2",
      genres: ["techno"],
      size: 3,
      artists: [{ spotifyId: "a", avatarId: "neon-pulse", role: "main" }],
    });
    expect(solo).toHaveLength(3);
    expect(solo.slice(1).every((c) => c.role === "backup")).toBe(true);

    const many = Array.from({ length: 8 }, (_, i) => ({
      spotifyId: `a${i}`,
      avatarId: avatars[i]!.id,
      role: "feature" as const,
    }));
    expect(buildCast({ trackKey: "t3", genres: [], artists: many, maxSize: 5 })).toHaveLength(5);
  });

  it("ist pro Song deterministisch", () => {
    const input = { trackKey: "same", genres: [], artists: [{ spotifyId: "a", avatarId: "luna-flow", role: "main" as const }] };
    expect(buildCast(input)).toEqual(buildCast(input));
  });
});

describe("Outfits", () => {
  it("Materialrollen aus den Modellnamen; jedes Modell hat Anzug und Leuchtstreifen", async () => {
    const { materialRole } = await import("@/lib/avatars/outfits");
    const { readdirSync, readFileSync } = await import("node:fs");
    expect(materialRole("Midnight stage suit.007")).toBe("suit");
    expect(materialRole("Pearl armor.004")).toBe("armor");
    expect(materialRole("Signature luminous trim.006")).toBe("trim");
    expect(materialRole("Warm porcelain.003")).toBeUndefined(); // Haut bleibt
    expect(materialRole("Lime LED display.001")).toBeUndefined();
    for (const f of readdirSync("avatars").filter((n) => n.endsWith(".glb"))) {
      const b = readFileSync(`avatars/${f}`);
      const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8")) as { materials: Array<{ name: string }> };
      const roles = new Set(json.materials.map((m) => materialRole(m.name)));
      expect(roles.has("suit"), f).toBe(true);
      expect(roles.has("trim"), f).toBe(true);
    }
  });

  it("Künstler behalten ihr Outfit, die Crew trägt Look und Farbe des Leads", async () => {
    const { dressCast, outfitById, outfitForArtist, OUTFITS } = await import("@/lib/avatars/outfits");
    expect(outfitForArtist("a1")).toBe(outfitForArtist("a1"));
    const ids = Array.from({ length: 200 }, (_, i) => outfitForArtist(`artist-${i}`));
    expect(new Set(ids.filter(Boolean)).size).toBe(OUTFITS.length); // alle Outfits kommen vor
    expect(ids.filter((o) => o === undefined).length).toBeGreaterThan(20); // manche treten im Original auf
    for (const o of ids) if (o) expect(outfitById.has(o)).toBe(true);

    const cast = dressCast(
      [
        { avatarId: "luna-flow", artistId: "a1", role: "lead" as const, position: 0 },
        { avatarId: "atlas-prism", artistId: "a2", role: "feature" as const, position: -1 },
        { avatarId: "neon-pulse", role: "backup" as const, position: 1 },
      ],
      [
        { spotifyId: "a1", color: "#ff4fd8" },
        { spotifyId: "a2", color: "#3ee6ff" },
      ],
    );
    expect(cast[0]).toMatchObject({ trim: "#ff4fd8" });
    expect(cast[0]!.outfit).toBe(outfitForArtist("a1"));
    expect(cast[1]).toMatchObject({ trim: "#3ee6ff" });
    expect(cast[1]!.outfit).toBe(outfitForArtist("a2"));
    expect(cast[2]!.trim).toBe("#ff4fd8"); // Crew in der Farbe des Leads
    expect(cast[2]!.outfit).toBe(cast[0]!.outfit);
    expect(dressCast([{ avatarId: "x", role: "backup" as const, position: 0 }], [])).toEqual([
      { avatarId: "x", role: "backup", position: 0 },
    ]);
  });
});
