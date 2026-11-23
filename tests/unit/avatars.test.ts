import { describe, expect, it } from "vitest";
import { avatars, commonClips, timeScaleFor } from "@/lib/avatars/catalog";
import { avatarForArtist, buildCast, preferredAvatars } from "@/lib/avatars/casting";

describe("Avatar-Katalog", () => {
  it("kennt alle 50 Avatare und die 20 gemeinsamen Clips", () => {
    expect(avatars).toHaveLength(50);
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
    expect(preferredAvatars(["death metal"])[0]).toBe("knochen-kalle");
    expect(preferredAvatars(["german hip hop"])[0]).toBe("mc-flow");
    expect(preferredAvatars(["classical"])[0]).toBe("frack-pinguin");
    expect(preferredAvatars(["schlager"]).slice(0, 2)).toEqual(["lederhosn-sepp", "dirndl-vroni"]);
    expect(preferredAvatars(["rockabilly"])[0]).toBe("tolle-teddy");
    expect(preferredAvatars(["ranchera"])[0]).toBe("mariachi-miguel");
    expect(preferredAvatars(["kinderlieder"]).slice(0, 2)).toEqual(["dino-rex", "chibi-momo"]);
    expect(preferredAvatars(["sea shanty"])[0]).toBe("pirat-paula");
    expect(preferredAvatars(["reggae"])[0]).toBe("hai-kostuem");
    expect(preferredAvatars(["chiptune"])[0]).toBe("ninja-nori");
    expect(preferredAvatars(["k-pop"]).slice(0, 2)).toEqual(["chibi-pixel", "chibi-mika"]);
    expect(preferredAvatars(["bedroom pop"])[0]).toBe("chibi-rin");
    expect(preferredAvatars(["indie folk"])[0]).toBe("fuchs-fritzi");
    expect(preferredAvatars(["christmas"])).toEqual(["weihnachtsmann", "rentier", "schneemann"]);
    expect(preferredAvatars(["horror punk"]).slice(0, 2)).toEqual(["kuerbis-kopf", "vampir-vlad"]);
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

describe("Saison-Besetzung", () => {
  const cast = [
    { avatarId: "aurora-synth", artistId: "a1", role: "lead" as const, position: 0 },
    { avatarId: "luna-flow", role: "backup" as const, position: -1 },
    { avatarId: "sol-groove", role: "backup" as const, position: 1 },
  ];
  const song = (title: string, trackKey = "t1") => ({ trackKey, title, genres: ["pop"] });

  it("Saison am Datum: Advent bis Weihnachten, zwei Wochen vor Halloween", async () => {
    const { seasonOn } = await import("@/lib/avatars/casting");
    expect(seasonOn("2026-12-01")).toBe("weihnachten");
    expect(seasonOn("2026-12-24")).toBe("weihnachten");
    expect(seasonOn("2026-12-27")).toBeNull();
    expect(seasonOn("2026-10-31")).toBe("halloween");
    expect(seasonOn("2026-11-20")).toBeNull();
  });

  it("Weihnachtssongs tanzen das ganze Jahr mit der Weihnachts-Crew, Künstler behalten ihren Avatar", async () => {
    const { withSeasonalCrew, SEASON_CREW } = await import("@/lib/avatars/casting");
    const out = withSeasonalCrew(cast, song("Last Christmas"), "2026-07-01");
    expect(out[0]!.avatarId).toBe("aurora-synth");
    for (const c of out.slice(1)) expect(SEASON_CREW.weihnachten).toContain(c.avatarId);
    expect(new Set(out.map((c) => c.avatarId)).size).toBe(3);
    const halloween = withSeasonalCrew(cast, song("Zombie Dance"), "2026-03-01");
    for (const c of halloween.slice(1)) expect(SEASON_CREW.halloween).toContain(c.avatarId);
  });

  it("in der Saison: bei etwa zwei von drei Songs ein Crew-Mitglied außen; sonst unverändert", async () => {
    const { withSeasonalCrew, SEASON_CREW } = await import("@/lib/avatars/casting");
    expect(withSeasonalCrew(cast, song("Sommerhit"), "2026-11-20")).toBe(cast);
    let swapped = 0;
    for (let i = 0; i < 60; i++) {
      const out = withSeasonalCrew(cast, song("Lied", `t${i}`), "2026-12-10");
      expect(out[1]!.avatarId).toBe("luna-flow");
      if (out[2]!.avatarId !== "sol-groove") {
        swapped++;
        expect(SEASON_CREW.weihnachten).toContain(out[2]!.avatarId);
      }
    }
    expect(swapped).toBeGreaterThan(25);
    expect(swapped).toBeLessThan(55);
    // gleicher Song, gleicher Tag → gleiche Besetzung
    expect(withSeasonalCrew(cast, song("Lied", "t7"), "2026-12-10")).toEqual(
      withSeasonalCrew(cast, song("Lied", "t7"), "2026-12-10"),
    );
  });
});
