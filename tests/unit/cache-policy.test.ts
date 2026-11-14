import { describe, expect, it } from "vitest";
import { CACHE_TTL, REPORT_INTERVAL_MS, SNAPSHOT_STALE_MS } from "@/lib/cache-policy";
import { decodeValue, encodeValue } from "@/lib/lyrics/cache";

describe("Cache-Richtlinie", () => {
  it("Lyrics länger als Infos, Persönliches kurz; Alexa wartet länger als das längste Meldeintervall", () => {
    expect(CACHE_TTL.lyricsFound).toBe(180 * 86_400);
    expect(CACHE_TTL.infoFound).toBe(30 * 86_400);
    expect(CACHE_TTL.lyricsMissing).toBeLessThan(CACHE_TTL.lyricsFound);
    expect(CACHE_TTL.snapshot).toBeLessThanOrEqual(2 * 3600);
    expect(SNAPSHOT_STALE_MS).toBeGreaterThan(REPORT_INTERVAL_MS.idle);
  });

  it("Upstash-Kontingent: Dashboard-Meldungen bleiben im Dauerbetrieb unter 500 000 Befehlen/Monat", () => {
    // 8 h Wiedergabe + 16 h Leerlauf pro Tag, je Meldung 2 Redis-Befehle (SET Stand, GET Befehle)
    const perDay = ((8 * 3600_000) / REPORT_INTERVAL_MS.playing + (16 * 3600_000) / REPORT_INTERVAL_MS.idle) * 2;
    expect(perDay * 31).toBeLessThan(500_000 * 0.5); // Rest für Lyrics/Infos/Alexa
  });

  it("Kodierung: klein unkomprimiert, groß komprimiert, beides umkehrbar", () => {
    expect(encodeValue({ a: 1 })).toBe('{"a":1}');
    const big = { x: "y".repeat(5000) };
    expect(encodeValue(big).startsWith("gz:")).toBe(true);
    expect(decodeValue(encodeValue(big))).toEqual(big);
    expect(decodeValue('{"alt":true}')).toEqual({ alt: true });
  });
});
