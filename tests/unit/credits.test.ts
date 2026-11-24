import { describe, expect, it } from "vitest";
import { CREDITS_WINDOW_MS, creditsDurationS, creditsFor, shouldRollCredits } from "@/lib/show/credits";
import type { LogEntry, Recap } from "@/lib/show/recap";

const MIN = 60_000;
const entry = (title: string, artist: string, at: number, extra: Partial<LogEntry> = {}): LogEntry => ({
  trackKey: title,
  title,
  artist,
  durationMs: 4 * MIN,
  at,
  ...extra,
});
const recap = (setlist: LogEntry[]): Recap => ({
  songs: setlist.length,
  minutes: 12,
  since: setlist[0]!.at,
  highlights: [],
  encores: [],
  liked: 0,
  tips: [],
  recent: [...setlist].reverse(),
  setlist,
});

describe("Abspann", () => {
  const now = 100 * MIN;
  const evening = [
    entry("Bussi Baby", "Wanda", now - 20 * MIN),
    entry("Maschin", "Bilderbuch", now - 16 * MIN, { liked: true }),
    entry("Columbo", "Wanda, Gast", now - 8 * MIN, { phase: "zugabe" }),
  ];

  it("Setlist in Reihenfolge, wer auf der Bühne stand, Dank ans Publikum", () => {
    const lines = creditsFor(recap(evening), { date: "Dienstag, 24. November", lamps: true });
    const text = lines.map((l) => `${l.text}|${l.sub ?? ""}`);
    expect(text).toContain("Euer Abend|Dienstag, 24. November");
    expect(text).toContain("1. Bussi Baby|Wanda");
    expect(text).toContain("2. Maschin ♥|Bilderbuch");
    expect(text).toContain("3. Columbo|Wanda, Gast · Zugabe");
    expect(text).toContain("Wanda|2 Songs");
    expect(text).toContain("Gast|1 Song");
    expect(text).toContain("Raumlicht|Govee-Lampen");
    expect(lines.at(-1)).toEqual({ kind: "dank", text: "Danke, dass ihr da wart!" });
    expect(creditsFor(recap(evening), { date: "x" }).some((l) => l.text === "Raumlicht")).toBe(false);
    expect(creditsDurationS(5)).toBe(25);
    expect(creditsDurationS(40)).toBe(64);
  });

  it("rollt einmal je Abend, nur kurz nachdem die Musik aufgehört hat", () => {
    const r = recap(evening);
    const end = evening.at(-1)!.at + evening.at(-1)!.durationMs;
    expect(shouldRollCredits(r, end + MIN, null)).toBe(true);
    expect(shouldRollCredits(r, end + MIN, r.since)).toBe(false); // schon gezeigt
    expect(shouldRollCredits(r, end + CREDITS_WINDOW_MS + 1, null)).toBe(false); // zu lange her
    expect(shouldRollCredits(r, end - 60_000, null)).toBe(false); // Song läuft noch
    expect(shouldRollCredits(null, end, null)).toBe(false);
  });
});
