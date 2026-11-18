import { describe, expect, it } from "vitest";
import { lineSegments, lipsyncTracks, mouthAt, syllablesOf } from "@/lib/dance/lipsync";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { hoshizora } from "@/lib/song-context/fixtures/hoshizora";
import { instrumental } from "@/lib/song-context/fixtures/instrumental";

describe("Lippensynchron", () => {
  it("Silben aus Vokalen: a weit offen, o/u rund, e/i breit", () => {
    expect(syllablesOf("Neonlicht")).toHaveLength(2); // Vokalgruppen „eo“ und „i“
    expect(syllablesOf("Morgen")).toHaveLength(2);
    const [a] = syllablesOf("da");
    const [o] = syllablesOf("so");
    const [i] = syllablesOf("die");
    expect(a!.open).toBe(1);
    expect(o!.round).toBe(1);
    expect(i!.round).toBe(0);
    expect(syllablesOf("…")).toEqual([]);
    expect(syllablesOf("星空")).toHaveLength(2); // ohne lateinische Vokale: je Zeichen
  });

  it("Mund öffnet in der Silbe und ist dazwischen zu", () => {
    const segs = lineSegments({
      startMs: 1000,
      endMs: 2000,
      text: "la la",
      words: [
        { startMs: 1000, endMs: 1400, text: "la" },
        { startMs: 1600, endMs: 2000, text: "la" },
      ],
    });
    expect(segs).toHaveLength(2);
    expect(mouthAt(segs, 1150).open).toBeGreaterThan(0.6);
    expect(mouthAt(segs, 1500).open).toBe(0);
    expect(mouthAt(segs, 999).open).toBe(0);
    expect(mouthAt(segs, 1001).open).toBeLessThan(0.1); // öffnet erst
  });

  it("Feature-Song: jeder singt seine Zeilen, im Refrain singt die Crew leiser mit", () => {
    const byArtist = new Map(neonlicht.cast.filter((c) => c.artistId).map((c) => [c.artistId!, c.avatarId]));
    const tracks = lipsyncTracks(neonlicht, (a) => (a ? byArtist.get(a) : undefined));
    const lead = neonlicht.cast.find((c) => c.role === "lead")!.avatarId;
    const feature = neonlicht.cast.find((c) => c.role === "feature")!.avatarId;
    expect(tracks.get(lead)!.length).toBeGreaterThan(20);
    expect(tracks.get(feature)!.length).toBeGreaterThan(5);
    // eine Strophenzeile des Features: der Lead singt dort nicht
    const kaiLine = neonlicht.lyrics!.lines.find(
      (l) => l.agent && neonlicht.lyrics!.singers?.[l.agent] === neonlicht.cast.find((c) => c.role === "feature")!.artistId,
    )!;
    const mid = (kaiLine.startMs + kaiLine.endMs) / 2;
    const inChorus = neonlicht.lyrics!.sections.some((s) => s.kind === "chorus" && mid >= s.startMs && mid < s.endMs);
    if (!inChorus) expect(tracks.get(lead)!.some((s) => s.startMs <= mid && s.endMs > mid)).toBe(false);
    // Refrain: Backup singt mit, aber leiser
    const backup = neonlicht.cast.find((c) => c.role === "backup")!.avatarId;
    const chorus = neonlicht.lyrics!.sections.find((s) => s.kind === "chorus")!;
    const bk = tracks.get(backup)!.filter((s) => s.startMs >= chorus.startMs && s.startMs < chorus.endMs);
    expect(bk.length).toBeGreaterThan(0);
    expect(Math.max(...bk.map((s) => s.open))).toBeLessThanOrEqual(0.45);
  });

  it("japanischer Song nutzt die Umschrift; Instrumental ohne Lyrics bleibt stumm", () => {
    const lead = hoshizora.cast[0]!.avatarId;
    expect(lipsyncTracks(hoshizora, () => undefined).get(lead)!.length).toBeGreaterThan(10);
    expect(lipsyncTracks(instrumental, () => undefined).size).toBe(0);
  });
});
