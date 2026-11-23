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

describe("Avatar-Baukasten", () => {
  it("Wünsche (Hut, Brille, Kopfhörer, Größe, Leuchtfarbe) kommen auf den Platz des Künstlers", () => {
    const lead = neonlicht.artists[0]!;
    const map = artistAvatarsSchema.parse({
      [artistKey(lead.name)]: {
        name: lead.name,
        avatarId: lead.avatarId,
        trim: "#ff00aa",
        look: { hat: "cowboyhut", glasses: true, height: 1.1 },
      },
    });
    const patch = applyArtistAvatars(neonlicht, map)!;
    const own = patch.cast.find((c) => c.artistId === lead.spotifyId)!;
    expect(own.trim).toBe("#ff00aa");
    expect(own.look).toEqual({ hat: "cowboyhut", glasses: true, height: 1.1 });
    // zweimal anwenden ändert nichts mehr
    expect(applyArtistAvatars({ ...neonlicht, ...patch }, map)).toBeNull();
    expect(artistAvatarsSchema.safeParse({ x: { name: "x", avatarId: lead.avatarId, look: { hat: "krone" } } }).success).toBe(
      false,
    );
    expect(artistAvatarsSchema.safeParse({ x: { name: "x", avatarId: lead.avatarId, trim: "rot" } }).success).toBe(false);
  });

  it("Wunsch über dem gewürfelten Look: ausdrücklich kein Hut, breite Hüte ohne Kopfhörer", async () => {
    const { applyLookOverride } = await import("@/lib/avatars/looks");
    const base = { hat: "basecap" as const, headphones: true, glasses: false, height: 1, tint: 0.3 };
    expect(applyLookOverride(base, undefined)).toBe(base);
    expect(applyLookOverride(base, { hat: "keiner" }).hat).toBeUndefined();
    expect(applyLookOverride(base, { hat: "zylinder" })).toMatchObject({ hat: "zylinder", headphones: false });
    expect(applyLookOverride(base, { glasses: true, height: 0.9 })).toMatchObject({ hat: "basecap", glasses: true, height: 0.9 });
  });
});

describe("Avatar-Stil „nur Chibis“", () => {
  const ids = ["chibi-a", "chibi-b", "chibi-c", "chibi-d"];
  it("jede Figur wird ein Chibi, jeder höchstens einmal, Künstler stabil; gemischt ändert nichts", async () => {
    const { applyAvatarStyle } = await import("@/lib/avatars/overrides");
    expect(applyAvatarStyle(neonlicht, "gemischt", ids)).toBeNull();
    const out = applyAvatarStyle(neonlicht, "chibi", ids)!;
    expect(out.cast.every((c) => ids.includes(c.avatarId))).toBe(true);
    expect(new Set(out.cast.map((c) => c.avatarId)).size).toBe(out.cast.length);
    for (const a of out.artists) expect(out.cast.find((c) => c.artistId === a.spotifyId)?.avatarId).toBe(a.avatarId);
    // derselbe Künstler in einem anderen Song: derselbe Chibi
    const again = applyAvatarStyle({ ...neonlicht, trackKey: "anderer-song" }, "chibi", ids)!;
    expect(again.artists[0]!.avatarId).toBe(out.artists[0]!.avatarId);
    // schon alles Chibi → nichts zu tun
    expect(applyAvatarStyle({ ...neonlicht, ...out }, "chibi", ids)).toBeNull();
  });

  it("die echten Chibis stehen im Katalog", async () => {
    const { chibiIds } = await import("@/lib/avatars/overrides");
    expect(chibiIds().length).toBeGreaterThanOrEqual(10);
  });
});
