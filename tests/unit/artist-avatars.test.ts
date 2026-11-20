import { describe, expect, it } from "vitest";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { applyArtistAvatars, artistAvatarsSchema, artistKey, castWith } from "@/lib/avatars/overrides";

const lead = neonlicht.artists[0]!;
const feat = neonlicht.artists[1]!;

describe("Eigene Avatare je Künstler", () => {
  it("Schlüssel: Name ohne Groß-/Kleinschreibung und Leerraum", () => {
    expect(artistKey("  Mira Sol ")).toBe(artistKey("mira sol"));
  });

  it("Künstler und sein Platz in der Besetzung bekommen Avatar und Outfit", () => {
    const want = neonlicht.cast.find((c) => !c.artistId)?.avatarId === "velvet-jazz" ? "luna-flow" : "velvet-jazz";
    const out = applyArtistAvatars(neonlicht, { [artistKey(lead.name)]: { name: lead.name, avatarId: want, outfit: "gold" } })!;
    expect(out.artists[0]!.avatarId).toBe(want);
    const own = out.cast.find((c) => c.artistId === lead.spotifyId)!;
    expect(own).toMatchObject({ avatarId: want, outfit: "gold" });
    // jeder Avatar bleibt einmalig
    expect(new Set(out.cast.map((c) => c.avatarId)).size).toBe(out.cast.length);
    // schon angewendet → nichts mehr zu tun (kein Endlos-Speichern)
    expect(
      applyArtistAvatars(
        { ...neonlicht, ...out },
        { [artistKey(lead.name)]: { name: lead.name, avatarId: want, outfit: "gold" } },
      ),
    ).toBeNull();
  });

  it("Avatar eines anderen Künstlers: die beiden tauschen; feste Zuordnungen gewinnen", () => {
    const swapped = applyArtistAvatars(neonlicht, { [artistKey(lead.name)]: { name: lead.name, avatarId: feat.avatarId } })!;
    expect(swapped.artists.map((a) => a.avatarId)).toEqual([feat.avatarId, lead.avatarId]);
    expect(new Set(swapped.cast.map((c) => c.avatarId)).size).toBe(swapped.cast.length);
    // beide wollen denselben: der zweite behält seinen eigenen
    const both = applyArtistAvatars(neonlicht, {
      [artistKey(lead.name)]: { name: lead.name, avatarId: "velvet-jazz" },
      [artistKey(feat.name)]: { name: feat.name, avatarId: "velvet-jazz" },
    });
    const ids = (both ?? neonlicht).artists.map((a) => a.avatarId);
    expect(ids.filter((id) => id === "velvet-jazz")).toHaveLength(1);
  });

  it("ohne Zuordnung oder für andere Künstler: unverändert", () => {
    expect(applyArtistAvatars(neonlicht, {})).toBeNull();
    expect(applyArtistAvatars(neonlicht, undefined)).toBeNull();
    expect(applyArtistAvatars(neonlicht, { wanda: { name: "Wanda", avatarId: "velvet-jazz" } })).toBeNull();
  });

  it("Prüfung: nur bekannte Avatare und Outfits", () => {
    expect(artistAvatarsSchema.safeParse({ a: { name: "A", avatarId: "velvet-jazz", outfit: "gold" } }).success).toBe(true);
    expect(artistAvatarsSchema.safeParse({ a: { name: "A", avatarId: "gibtsnicht" } }).success).toBe(false);
    expect(artistAvatarsSchema.safeParse({ a: { name: "A", avatarId: "velvet-jazz", outfit: "pink" } }).success).toBe(false);
  });
});

describe("Demo-Besetzung (?avatare=…)", () => {
  const known = new Set(["disco-baer", "retro-bot", "glitzer-diva"]);
  it("besetzt der Reihe nach, Künstler bekommen den Avatar ihres Platzes, Unbekanntes fällt weg", () => {
    const s = castWith(neonlicht, ["disco-baer", "gibts-nicht", "retro-bot"], known);
    expect(s.cast.map((c) => c.avatarId)).toEqual(["disco-baer", "retro-bot", neonlicht.cast[2]!.avatarId]);
    expect(s.artists.map((a) => a.avatarId)).toEqual(["disco-baer", "retro-bot"]);
    expect(castWith(neonlicht, ["gibts-nicht"], known)).toBe(neonlicht);
  });
});
