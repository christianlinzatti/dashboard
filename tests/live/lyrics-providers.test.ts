import { describe, expect, it } from "vitest";
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
