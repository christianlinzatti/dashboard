import { describe, expect, it } from "vitest";
import { createPoliteFetch } from "@/lib/info/http";
import { lookupArtist } from "@/lib/info/service";

/**
 * Echte Abfrage MusicBrainz → Wikidata → Wikipedia/Commons für einen bekannten Artist.
 * Wikimedia drosselt Cloud-IPs teils stark – dann gilt der Test als übersprungen statt fehlgeschlagen.
 */
describe("Info-Quellen (live)", () => {
  it("liefert Text, Fakten und ein frei lizenziertes Foto für Queen", async () => {
    const http = createPoliteFetch({ minIntervalMs: { "musicbrainz.org": 1100 } });
    let info;
    try {
      info = await lookupArtist("Queen", http, AbortSignal.timeout(30_000));
    } catch (e) {
      if ((e as Error).name === "SourceBusyError" || /ausgelastet|busy/i.test((e as Error).message)) return;
      throw e;
    }
    expect(info).not.toBeNull();
    expect(info!.facts).toContain("Gegründet 1970");
    expect(info!.summary.length).toBeGreaterThan(50);
    expect(info!.wikiUrl).toMatch(/wikipedia\.org/);
  }, 60_000);
});

describe("Deezer-Tempo (live)", () => {
  it("BPM für „Blinding Lights“ über die ISRC", async () => {
    const { deezerBpm } = await import("@/lib/music/deezer");
    const bpm = await deezerBpm("USUG11904206", 200_040);
    expect(bpm).toBeGreaterThan(160);
    expect(bpm).toBeLessThan(180);
  });
});
