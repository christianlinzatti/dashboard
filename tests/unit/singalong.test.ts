import { describe, expect, it } from "vitest";
import { shotAt } from "@/lib/dance/evaluate";
import { planChoreography } from "@/lib/dance/plan";
import { instrumental } from "@/lib/song-context/fixtures/instrumental";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { planSingAlong, singAlongAt, SINGALONG_BARS } from "@/lib/show/singalong";
import { SLOWMO_BARS } from "@/lib/stage/climax";
import { crowdAt } from "@/lib/stage/crowd";

describe("Mitsing-Moment", () => {
  const c = planChoreography(neonlicht, 124);
  const s = c.singAlong!;
  const finale = c.climaxes.find((x) => x.finale)!;

  it("im letzten Refrain nach der Zeitlupe, vier Takte, nur mit Gesang", () => {
    expect(s.startMs).toBeCloseTo(finale.atMs + SLOWMO_BARS * c.barMs);
    expect(s.endMs - s.startMs).toBeLessThanOrEqual(SINGALONG_BARS * c.barMs + 1);
    expect(neonlicht.lyrics!.lines.some((l) => l.endMs > s.startMs && l.startMs < s.endMs)).toBe(true);
    // ohne Lyrics (Instrumental) oder ohne Finale: kein Mitsingen
    expect(planChoreography(instrumental, 132).singAlong).toBeNull();
    expect(planSingAlong(c.phrases, [], c.barMs, neonlicht.lyrics)).toBeNull();
  });

  it("weich ein- und ausgeblendet, sonst aus", () => {
    expect(singAlongAt(s, s.startMs - 10, c.beatMs)).toBe(0);
    expect(singAlongAt(s, s.startMs + c.beatMs / 2, c.beatMs)).toBeCloseTo(0.5);
    expect(singAlongAt(s, (s.startMs + s.endMs) / 2, c.beatMs)).toBe(1);
    expect(singAlongAt(null, s.startMs + 1000, c.beatMs)).toBe(0);
  });

  it("Publikum: alle Hände hoch; Kamera über die Köpfe", () => {
    const mid = (s.startMs + s.endMs) / 2;
    expect(crowdAt(c, mid).hands).toBeGreaterThan(0.9);
    expect(crowdAt(c, mid).jump).toBe(0);
    expect(shotAt(c, mid)).toBe("ueberkopf");
    expect(shotAt(c, s.endMs + 10)).not.toBe("ueberkopf");
  });
});
