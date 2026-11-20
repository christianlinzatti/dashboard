import { describe, expect, it } from "vitest";
import { lookFor, lookForAvatar, lookSeed, OWN_HEADWEAR } from "@/lib/avatars/looks";

describe("Avatar-Looks", () => {
  it("deterministisch: derselbe Künstler trägt immer denselben Look", () => {
    const seed = lookSeed({ avatarId: "neon-pulse", artistId: "a1" }, "song-1");
    expect(seed).toBe(lookSeed({ avatarId: "luna-flow", artistId: "a1" }, "song-2"));
    expect(lookFor(seed)).toEqual(lookFor(seed));
  });

  it("die Crew wechselt von Song zu Song, die Band bleibt", () => {
    expect(lookSeed({ avatarId: "neon-pulse" }, "s1")).not.toBe(lookSeed({ avatarId: "neon-pulse" }, "s2"));
    expect(lookSeed({ avatarId: "neon-pulse" }, "s1", true)).toBe(lookSeed({ avatarId: "neon-pulse" }, "s2", true));
  });

  it("Vielfalt: Hüte, Kopfhörer, Brillen, Größen – nicht jeder trägt etwas", () => {
    const looks = Array.from({ length: 400 }, (_, i) => lookFor(`k${i}`));
    const hats = new Set(looks.map((l) => l.hat));
    expect(hats.size).toBe(6); // fünf Hüte + ohne
    const bare = looks.filter((l) => !l.hat).length / looks.length;
    expect(bare).toBeGreaterThan(0.4);
    expect(bare).toBeLessThan(0.7);
    expect(looks.some((l) => l.headphones)).toBe(true);
    expect(looks.some((l) => l.glasses)).toBe(true);
    for (const l of looks) {
      expect(l.height).toBeGreaterThanOrEqual(0.94);
      expect(l.height).toBeLessThanOrEqual(1.06);
      // breite Hüte und Kopfhörer schließen sich aus
      if (l.hat === "cowboyhut" || l.hat === "zylinder") expect(l.headphones).toBe(false);
    }
  });
});

describe("Figuren mit eigener Kopfbedeckung", () => {
  it("bekommen keinen Hut und keine Kopfhörer, Brille und Statur bleiben", () => {
    // einen Schlüssel suchen, der sonst einen Hut ergäbe
    const seed = Array.from({ length: 200 }, (_, i) => `crew:x:${i}`).find((k) => lookFor(k).hat)!;
    for (const id of OWN_HEADWEAR) {
      const look = lookForAvatar(id, seed);
      expect(look.hat).toBeUndefined();
      expect(look.headphones).toBe(false);
      expect(look.height).toBe(lookFor(seed).height);
    }
    expect(lookForAvatar("punk-rocker", seed).hat).toBe(lookFor(seed).hat);
  });
});
