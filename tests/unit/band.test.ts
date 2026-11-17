import { describe, expect, it } from "vitest";
import { avatars } from "@/lib/avatars/catalog";
import { bandKind, planBand } from "@/lib/stage/band";
import { abendrot } from "@/lib/song-context/fixtures/abendrot";
import { instrumental } from "@/lib/song-context/fixtures/instrumental";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { loadedMixamo } from "@/lib/dance/mixamo-loader";
import { mixamoById } from "@/lib/dance/mixamo";

const all = avatars.map((a) => a.id);

describe("Band nach Genre", () => {
  it("DJ bei Techno, Gitarre + Schlagzeug bei Rock, Keyboard bei Jazz/Soul, sonst keine", () => {
    expect(bandKind(["techno"])).toBe("dj");
    expect(bandKind(["deep house"])).toBe("dj");
    expect(bandKind(["indie rock"])).toBe("rock");
    expect(bandKind(["heavy metal"])).toBe("rock");
    expect(bandKind(["jazz"])).toBe("keys");
    expect(bandKind(["neo soul"])).toBe("keys");
    expect(bandKind(["dance pop", "german hip hop"])).toBeNull();
    expect(planBand(neonlicht, all)).toBeNull();
    expect(planBand(instrumental, all)?.kind).toBe("dj");
    expect(planBand(abendrot, all)?.kind).toBe("keys");
    const rock = planBand({ ...neonlicht, music: { ...neonlicht.music, genres: ["rock"] } }, all)!;
    expect(rock.members.map((m) => m.role).sort()).toEqual(["gitarre", "schlagzeug"]);
  });

  it("Musiker sind Avatare, die nicht schon tanzen – bevorzugt passende Typen", () => {
    for (const song of [instrumental, abendrot, { ...neonlicht, music: { ...neonlicht.music, genres: ["rock"] } }]) {
      const band = planBand(song, all)!;
      const cast = new Set(song.cast.map((c) => c.avatarId));
      for (const m of band.members) expect(cast.has(m.avatarId)).toBe(false);
      expect(new Set(band.members.map((m) => m.avatarId)).size).toBe(band.members.length);
    }
    const rock = planBand({ ...neonlicht, cast: [], music: { ...neonlicht.music, genres: ["punk"] } }, all)!;
    expect(rock.members.find((m) => m.role === "gitarre")?.avatarId).toBe("ember-rock");
    // keine freien Avatare → keine Band
    expect(
      planBand(
        instrumental,
        instrumental.cast.map((c) => c.avatarId),
      ),
    ).toBeNull();
  });

  it("Regie-Genres (KI) zählen mit", () => {
    const show = { stage: "club" as const, mood: "mittel" as const, genres: ["techno"], motto: "x", sections: [] };
    expect(planBand({ ...neonlicht, show }, all)?.kind).toBe("dj");
  });

  it("Instrument-Animationen liegen im Katalog", () => {
    for (const id of ["Mixamo_PlayingDrums", "Mixamo_GuitarPlaying"]) expect(mixamoById.get(id)?.file).toBeTruthy();
    expect(loadedMixamo).toBeTypeOf("function");
  });
});
