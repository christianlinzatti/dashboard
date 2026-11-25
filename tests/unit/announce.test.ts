import { describe, expect, it } from "vitest";
import { announcementFor, fillCity, spokenTitle } from "@/lib/show/announce";
import { cleanAnnouncement, sanitizeBrief } from "@/lib/show/brief";
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

describe("Tour-Look", () => {
  it("Banner: Tourname, sonst Live in Heimatort, sonst Live", async () => {
    const { tourLine } = await import("@/lib/show/announce");
    const artists = [{ spotifyId: "w", name: "Wanda" }] as never;
    expect(tourLine({ artists, setlists: { w: { date: "2026-10-01", tour: "Ende nie Tour", songs: [] } } })).toBe(
      "Wanda · Ende nie Tour",
    );
    expect(tourLine({ artists, concertArea: { name: "Wien", radiusKm: 200 } })).toBe("Wanda · Live in Wien");
    expect(tourLine({ artists })).toBe("Wanda · Live");
    expect(tourLine({ artists: [] })).toBe("Live");
  });

  it("derselbe Künstler kommt am Abend auf dieselbe Bühne zurück", async () => {
    const { tourTheme } = await import("@/lib/stage/setlist");
    const { themeFor } = await import("@/lib/stage/themes");
    const { neonlicht } = await import("@/lib/song-context/fixtures/neonlicht");
    const played = [
      { trackKey: "a", theme: "strand" as const, artistId: "w" },
      { trackKey: "b", theme: "club" as const, artistId: "x" },
      { trackKey: "c", theme: "festival" as const, artistId: "w" },
    ];
    expect(tourTheme(played, "w", "neu")).toBe("festival"); // zuletzt
    expect(tourTheme(played, "w", "c")).toBe("strand"); // der Song selbst zählt nicht
    expect(tourTheme(played, "y", "neu")).toBeUndefined();
    expect(themeFor(neonlicht, "auto", "club", "festival")).toBe("festival");
    expect(themeFor(neonlicht, "jazz", "club", "festival")).toBe("jazz"); // feste Wahl geht vor
  });
});

describe("Ansagen der KI-Regie", () => {
  it("haben Vorrang vor den Vorlagen, je Abendphase; ohne KI-Zeile die Vorlage", () => {
    const ai = { hoehepunkt: "{s}, jetzt fliegt das Dach weg – Neonlicht!" };
    const base = { trackKey: "t1", title: "Neonlicht", liked: false };
    expect(announcementFor({ ...base, phase: "hoehepunkt", city: "Linz", ai })).toBe(
      "Linz, jetzt fliegt das Dach weg – Neonlicht!",
    );
    expect(announcementFor({ ...base, phase: "hoehepunkt", ai })).toBe("jetzt fliegt das Dach weg – Neonlicht!");
    expect(announcementFor({ ...base, phase: "auftakt", ai })).toMatch(/Neonlicht/);
  });

  it("Ort einsetzen oder samt Komma streichen", () => {
    expect(fillCity("Servus {s}!", "Wien")).toBe("Servus Wien!");
    expect(fillCity("Servus {s}!", undefined)).toBe("Servus!");
    expect(fillCity("Danke, {s}, ihr seid großartig!", undefined)).toBe("Danke ihr seid großartig!");
  });

  it("KI-Ansagen werden aufgeräumt: Länge, fremde Platzhalter, Anführungszeichen", () => {
    expect(cleanAnnouncement("  „Servus {s}!   Los geht's!“ ")).toBe("Servus {s}! Los geht's!");
    expect(cleanAnnouncement("Hallo {name}, hier kommt der Song!")).toBe("Hallo , hier kommt der Song!");
    expect(cleanAnnouncement("Kurz")).toBeUndefined();
    expect(cleanAnnouncement("x".repeat(200))).toBeUndefined();
    expect(cleanAnnouncement(undefined)).toBeUndefined();
    const brief = sanitizeBrief({
      stage: "club",
      mood: "energetisch",
      genres: ["pop"],
      motto: "Neonnacht",
      sections: [],
      announcements: { auftakt: "Guten Abend {s}, los geht's!", zugabe: "x" },
    });
    expect(brief?.announcements).toEqual({ auftakt: "Guten Abend {s}, los geht's!" });
    // ältere Briefs ohne Ansagen bleiben gültig
    expect(sanitizeBrief({ stage: "club", mood: "mittel", genres: [], motto: "M", sections: [] })?.announcements).toBeUndefined();
  });
});
