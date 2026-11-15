import { describe, expect, it, vi } from "vitest";
import { resolveOctave } from "@/lib/audio/lock";
import { deezerBpm } from "@/lib/music/deezer";
import { createTempoService } from "@/lib/music/tempo-service";
import { CACHE_TTL } from "@/lib/cache-policy";
import { memoryCache } from "@/lib/lyrics/cache";
import blinding from "../fixtures/deezer/blinding-lights.json";
import unknownBpm from "../fixtures/deezer/bpm-unknown.json";
import notFound from "../fixtures/deezer/not-found.json";

type Http = (url: string, init?: RequestInit) => Promise<Response>;
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

describe("Deezer-Tempo (echte Antworten)", () => {
  it("liefert BPM über die ISRC, gerundet", async () => {
    const http = vi.fn<Http>(async () => ok(blinding));
    expect(await deezerBpm("USUG11904206", 200_040, http)).toBe(170.8);
    expect(http.mock.calls[0]![0]).toBe("https://api.deezer.com/track/isrc:USUG11904206");
  });
  it("unbekanntes Tempo (0), unbekannte ISRC, andere Version → kein Wert", async () => {
    expect(await deezerBpm("DEUM71300765", undefined, async () => ok(unknownBpm))).toBeNull();
    expect(await deezerBpm("XXINVALID000", undefined, async () => ok(notFound))).toBeNull();
    expect(await deezerBpm("USUG11904206", 260_000, async () => ok(blinding))).toBeNull(); // Dauer passt nicht
    expect(await deezerBpm("kaputt", undefined, async () => ok(blinding))).toBeNull();
  });
  it("Kontingent/Serverfehler → Ausnahme (wird nicht gecacht)", async () => {
    await expect(
      deezerBpm("USUG11904206", undefined, async () => ok({ error: { code: 4, message: "Quota limit exceeded" } })),
    ).rejects.toThrow("4");
    await expect(deezerBpm("USUG11904206", undefined, async () => ok({}, 503))).rejects.toThrow("503");
  });
});

describe("Tempo-Dienst", () => {
  it("cacht Treffer lang, unbekannt kürzer", async () => {
    const cache = memoryCache();
    const set = vi.spyOn(cache, "set");
    const http = vi.fn<Http>(async (u) => ok(u.includes("USUG") ? blinding : unknownBpm));
    const svc = createTempoService({ cache, fetch: http as typeof fetch });
    expect(await svc("USUG11904206", 200_040)).toEqual({ bpm: 170.8, source: "deezer" });
    await svc("USUG11904206", 200_040);
    expect(http).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("tempo:v1:USUG11904206", { bpm: 170.8 }, CACHE_TTL.tempoFound);
    await svc("DEUM71300765");
    expect(set).toHaveBeenCalledWith("tempo:v1:DEUM71300765", { bpm: null }, CACHE_TTL.tempoMissing);
  });
});

describe("Oktavfehler mit Startwert auflösen", () => {
  it("halbes, doppeltes, 1,5-faches Tempo wird korrigiert", () => {
    expect(resolveOctave(85.4, 170.8)).toBeCloseTo(170.8);
    expect(resolveOctave(341, 170.8)).toBeCloseTo(170.5);
    expect(resolveOctave(80, 120)).toBe(120);
    expect(resolveOctave(172, 170.8)).toBe(172); // passt schon
  });
  it("ohne Startwert oder ohne Nähe bleibt der Messwert", () => {
    expect(resolveOctave(97, undefined)).toBe(97);
    expect(resolveOctave(97, 170)).toBe(97);
    expect(resolveOctave(0, 120)).toBe(0);
  });
});
