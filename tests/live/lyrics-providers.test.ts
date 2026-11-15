import { describe, expect, it } from "vitest";
import { betterLyrics } from "@/lib/lyrics/providers/better-lyrics";
import { lrclib } from "@/lib/lyrics/providers/lrclib";
import type { TrackQuery } from "@/lib/lyrics/types";

/**
 * Referenzsongs mit bekannt vorhandenen synchronisierten Lyrics.
 * Es werden nur Struktur und Anzahl geprüft – kein Liedtext wird ausgegeben.
 */
const references: TrackQuery[] = [
  { trackKey: "ref1", title: "Bohemian Rhapsody", artists: ["Queen"], album: "A Night at the Opera", durationMs: 354_000 },
  { trackKey: "ref2", title: "Atemlos durch die Nacht", artists: ["Helene Fischer"], durationMs: 219_000 },
  { trackKey: "ref3", title: "Blinding Lights", artists: ["The Weeknd"], album: "After Hours", durationMs: 200_000 },
];

describe("LRCLIB (live)", () => {
  it.each(references)("liefert synchronisierte Lyrics für „$title“", async (q) => {
    const r = await lrclib().search(q, AbortSignal.timeout(15_000));
    expect(r, "kein Treffer").not.toBeNull();
    expect(r!.sync).not.toBe("plain");
    expect(r!.lines.length).toBeGreaterThan(10);
    expect(r!.lines.every((l, i, a) => i === 0 || l.startMs >= a[i - 1]!.startMs)).toBe(true);
  });
});

describe("Better Lyrics (live)", () => {
  // ohne API-Key liefert der Dienst nur Songs aus seinem Cache – „Blinding Lights“ ist dort vorhanden
  it("Wort-Sync mit Abschnitten für „Blinding Lights“", async () => {
    const q = references[2]!;
    const r = await betterLyrics({ apiKey: process.env.BETTER_LYRICS_API_KEY }).search(q, AbortSignal.timeout(15_000));
    expect(r, "kein Treffer").not.toBeNull();
    expect(r!.sync).toBe("word");
    expect(r!.lines.length).toBeGreaterThan(20);
    expect(r!.sections?.some((s) => s.kind === "chorus")).toBe(true);
    expect(r!.lines.flatMap((l) => l.words ?? []).some((w) => w.syllables?.length)).toBe(true);
    expect(Math.abs((r!.durationMs ?? 0) - q.durationMs)).toBeLessThan(3500);
  });
});
