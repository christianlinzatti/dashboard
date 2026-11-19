import { describe, expect, it } from "vitest";
import { NEW_EVENING_MS, summarize, type LogEntry } from "@/lib/show/recap";

const MIN = 60_000;
const at = (m: number) => Date.UTC(2026, 10, 20, 20, 0) + m * MIN;
const song = (m: number, title: string, artist: string, extra: Partial<LogEntry> = {}): LogEntry => ({
  trackKey: title,
  title,
  artist,
  durationMs: 4 * MIN,
  at: at(m),
  ...extra,
});

describe("Rückblick auf den Abend", () => {
  const log = [
    song(0, "Eins", "Wanda"),
    song(4, "Zwei", "Wanda", { liked: true }),
    song(8, "Drei", "Bilderbuch", { phase: "hoehepunkt" }),
    song(10, "Vier", "Wanda", { phase: "zugabe", liked: true }),
  ];

  it("zählt Songs, gehörte Zeit, Höhepunkte, Zugaben, Lieblingssongs und den meistgespielten Künstler", () => {
    const r = summarize(log, at(30))!;
    expect(r.songs).toBe(4);
    // 4 + 4 + 2 (übersprungen) + 4 Min.
    expect(r.minutes).toBe(14);
    expect(r.highlights).toEqual(["Drei"]);
    expect(r.encores).toEqual(["Vier"]);
    expect(r.liked).toBe(2);
    expect(r.topArtist).toEqual({ name: "Wanda", songs: 3 });
    expect(r.recent[0]!.title).toBe("Vier");
    expect(r.since).toBe(at(0));
  });

  it("nur der jüngste Abend; zu wenig Songs oder lange Pause: kein Rückblick", () => {
    const yesterday = [song(-24 * 60, "Gestern", "X"), song(-24 * 60 + 4, "Gestern 2", "X")];
    expect(summarize([...yesterday, ...log], at(30))!.songs).toBe(4);
    expect(summarize(log.slice(0, 2), at(30))).toBeNull();
    expect(summarize(log, at(10) + NEW_EVENING_MS + MIN)).toBeNull();
    expect(summarize([], at(0))).toBeNull();
  });
});
