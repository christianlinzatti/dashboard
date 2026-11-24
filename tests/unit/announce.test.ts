import { describe, expect, it } from "vitest";
import { announcementFor, spokenTitle } from "@/lib/show/announce";
import { eveningPhases } from "@/lib/show/evening";

describe("Ansage des Sängers", () => {
  it("passt zur Phase des Abends, mit Stadt und Titel; gleich für denselben Song", () => {
    const base = { trackKey: "t1", title: "Bussi Baby", city: "Wien" };
    for (const phase of eveningPhases) {
      const a = announcementFor({ ...base, phase });
      expect(a).toContain("„Bussi Baby“");
      expect(a).toContain("Wien");
      expect(a).not.toMatch(/\{[st]\}/);
      expect(announcementFor({ ...base, phase })).toBe(a);
    }
    expect(announcementFor({ ...base, phase: "auftakt" })).toMatch(/Servus|Guten Abend|Anblick/);
    expect(announcementFor({ ...base, phase: "zugabe" })).toMatch(/Zugabe|noch einen/);
    expect(announcementFor({ ...base, phase: "durchatmen" })).toMatch(/ruhiger|Lichter/);
  });

  it("ohne Heimatort ohne Stadt; verschiedene Songs bekommen verschiedene Ansagen", () => {
    const a = announcementFor({ trackKey: "x", title: "Maschin", phase: "steigerung" });
    expect(a).not.toContain("undefined");
    expect(a).not.toMatch(/, –|, „|\s,/);
    const texts = new Set(
      Array.from({ length: 20 }, (_, i) => announcementFor({ trackKey: `k${i}`, title: "T", phase: "steigerung" })),
    );
    expect(texts.size).toBeGreaterThan(2);
  });

  it("Lieblingssong: manche bekommen den Mitsing-Aufruf; Titel ohne Zusätze", () => {
    const liked = Array.from({ length: 20 }, (_, i) =>
      announcementFor({ trackKey: `k${i}`, title: "T", phase: "steigerung", liked: true }),
    );
    expect(liked.some((t) => /liebt ihr|Singt mit/.test(t))).toBe(true);
    expect(spokenTitle("Bohemian Rhapsody - Remastered 2011")).toBe("Bohemian Rhapsody");
    expect(spokenTitle("Song (feat. X)")).toBe("Song");
    expect(spokenTitle("(Nur Klammer)")).toBe("(Nur Klammer)");
  });
});
