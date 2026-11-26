import { beforeEach, describe, expect, it, vi } from "vitest";
import { artistMetaFor, artistMetaKey, loadArtistMeta } from "@/lib/spotify/artist-meta";
import { ensureArtistMeta, knownArtistMeta, resetArtistMetaCache } from "@/lib/spotify/artist-meta-client";
import { applyNowPlaying } from "@/lib/spotify/sync";
import { spotifyTrackSchema, type NowPlaying } from "@/lib/spotify/types";
import { createSongContextStore } from "@/lib/song-context/store";
import { preferredAvatars } from "@/lib/avatars/casting";
import { memoryCache } from "@/lib/lyrics/cache";
import { CACHE_TTL } from "@/lib/cache-policy";

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const RAMMSTEIN = { id: "6wWVKhxIU2cEi0K81v7HvP", name: "Rammstein" };

describe("Genres und Bilder der Künstler (Server)", () => {
  it("Spotify zuerst; ohne Genres von Spotify die offenen Quellen", async () => {
    const call = vi.fn(async () =>
      ok({
        genres: ["neue deutsche harte", "industrial metal"],
        images: [{ url: "https://i.scdn.co/r", width: 640, height: 640 }],
      }),
    );
    const http = vi.fn(async () => ok({}));
    const a = await loadArtistMeta(RAMMSTEIN, { call, http, audioDbKey: "123" });
    expect(a).toMatchObject({ source: "spotify", genres: ["neue deutsche harte", "industrial metal"] });
    expect(a.images[0]).toEqual({ url: "https://i.scdn.co/r", width: 640, height: 640 });
    expect(call).toHaveBeenCalledWith(`/artists/${RAMMSTEIN.id}`);
    expect(http).not.toHaveBeenCalled();

    // Entwicklungsmodus: Spotify ohne Genres → Last.fm/TheAudioDB
    const empty = vi.fn(async () => ok({ images: [] }));
    const tags = vi.fn(async (url: string) =>
      url.includes("audioscrobbler")
        ? ok({
            toptags: {
              tag: [
                { name: "Industrial Metal", count: 100 },
                { name: "german", count: 60 },
              ],
            },
          })
        : ok({ artists: null }),
    );
    const b = await loadArtistMeta(RAMMSTEIN, { call: empty, http: tags, audioDbKey: "123", lastfmKey: "k" });
    expect(b.source).toBe("quellen");
    expect(b.genres.map((g) => g.toLowerCase())).toContain("industrial metal");
  });

  it("gemerkt: mit Genres 7 Tage, ohne 1 Tag; ungültige IDs übersprungen", async () => {
    const cache = memoryCache();
    const setSpy = vi.spyOn(cache, "set");
    const call = vi.fn(async () => ok({ genres: ["rock"] }));
    const deps = { cache, call, http: async () => ok({}), audioDbKey: "123" };
    await artistMetaFor([RAMMSTEIN, { id: "kaputt!", name: "X" }], deps);
    await artistMetaFor([RAMMSTEIN], deps);
    expect(call).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(artistMetaKey(RAMMSTEIN.id), expect.anything(), CACHE_TTL.artistMeta);
  });
});

describe("Genres der Künstler (Kiosk)", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    resetArtistMetaCache();
  });

  it("holt fehlende einmal, merkt sie im Browser", async () => {
    const fetchMock = vi.fn(async () => ok({ artists: { [RAMMSTEIN.id]: { genres: ["industrial metal"], images: [] } } }));
    const artist = { spotifyId: RAMMSTEIN.id, name: "Rammstein" };
    expect(await ensureArtistMeta([artist], fetchMock as unknown as typeof fetch)).toEqual({
      [RAMMSTEIN.id]: { genres: ["industrial metal"], images: [] },
    });
    await ensureArtistMeta([artist], fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resetArtistMetaCache(); // neu geladen: aus dem Browser-Speicher
    expect(knownArtistMeta([RAMMSTEIN.id])[RAMMSTEIN.id]?.genres).toEqual(["industrial metal"]);
  });

  it("bekannte Genres steuern die Figurenwahl beim Songstart", () => {
    const track = spotifyTrackSchema.parse({
      id: "4uLU6hMCjMI75M1A2tKUQC",
      type: "track",
      name: "Engel",
      duration_ms: 264_000,
      explicit: false,
      artists: [{ id: RAMMSTEIN.id, name: "Rammstein" }],
      album: { name: "Sehnsucht", images: [{ url: "https://i.scdn.co/c", width: 640, height: 640 }] },
    });
    const np: NowPlaying = { state: "playing", progressMs: 1000, fetchedAt: 0, track };
    const genres = ["industrial metal", "rock"];
    const store = createSongContextStore();
    applyNowPlaying(store, np, 50, 1000, Date.now(), { [RAMMSTEIN.id]: { genres, images: [] } });
    const lead = store.getState().song!.artists[0]!;
    expect(lead.genres).toEqual(genres);
    const fitting = preferredAvatars(genres);
    expect(fitting.length).toBeGreaterThan(0);
    expect(fitting).toContain(lead.avatarId);
  });
});
