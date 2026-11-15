import { describe, expect, it, vi } from "vitest";
import { createLastfm, LastfmError } from "@/lib/personal/lastfm";
import { artistsFollowed, trackSaved } from "@/lib/personal/spotify-library";
import { recentTracks, userInfoFor } from "@/lib/personal/service";
import { ago } from "@/components/personal/RecentList";

/** Antworten im Format der Last.fm-Doku (Zahlen als Strings). */
const lastfmResponses: Record<string, unknown> = {
  "user.getrecenttracks": {
    recenttracks: {
      track: [
        {
          artist: { url: "u", name: "Queen", image: [] },
          name: "Bohemian Rhapsody",
          album: { mbid: "", "#text": "A Night at the Opera" },
          image: [
            { size: "small", "#text": "https://lastfm.example/s.jpg" },
            { size: "large", "#text": "https://lastfm.example/l.jpg" },
          ],
          "@attr": { nowplaying: "true" },
          loved: "1",
          url: "https://www.last.fm/music/Queen/_/Bohemian+Rhapsody",
        },
        {
          artist: { name: "Helene Fischer" },
          name: "Atemlos",
          image: [],
          date: { uts: "1700000000", "#text": "14 Nov 2023" },
          loved: "0",
        },
      ],
      "@attr": { user: "test", page: "1", perPage: "10", totalPages: "1", total: "2" },
    },
  },
  "track.getinfo": { track: { name: "Atemlos", playcount: "123456", userplaycount: "37", userloved: "1" } },
  "artist.getinfo": {
    artist: {
      name: "Queen",
      stats: { listeners: "1", playcount: "2", userplaycount: "432" },
      tags: { tag: [{ name: "rock" }, { name: "classic rock" }] },
    },
  },
};

function lastfmHttp(override?: (method: string) => unknown) {
  return vi.fn(async (url: string) => {
    const method = new URL(url).searchParams.get("method")!;
    const body = override?.(method) ?? lastfmResponses[method];
    return Response.json(body);
  });
}

describe("Last.fm", () => {
  it("zuletzt gehört: laufender Song, Datum, Cover, geliebt", async () => {
    const lf = createLastfm({ apiKey: "k", user: "u" }, lastfmHttp());
    const t = await lf.recentTracks();
    expect(t[0]).toMatchObject({
      title: "Bohemian Rhapsody",
      artist: "Queen",
      nowPlaying: true,
      loved: true,
      imageUrl: "https://lastfm.example/l.jpg",
    });
    expect(t[1]).toMatchObject({ artist: "Helene Fischer", playedAt: 1_700_000_000, nowPlaying: false, loved: false });
  });

  it("Hörstatistik für Song und Künstler", async () => {
    const lf = createLastfm({ apiKey: "k", user: "u" }, lastfmHttp());
    expect(await lf.trackStats("Helene Fischer", "Atemlos")).toEqual({ plays: 37, loved: true });
    expect(await lf.artistStats("Queen")).toEqual({ plays: 432, tags: ["rock", "classic rock"] });
  });

  it("„nicht gefunden“ → null, ungültiger Key → Fehler", async () => {
    const notFound = createLastfm(
      { apiKey: "k", user: "u" },
      lastfmHttp(() => ({ error: 6, message: "Track not found" })),
    );
    expect(await notFound.trackStats("x", "y")).toBeNull();
    const badKey = createLastfm(
      { apiKey: "k", user: "u" },
      lastfmHttp(() => ({ error: 10, message: "Invalid API key" })),
    );
    await expect(badKey.recentTracks()).rejects.toBeInstanceOf(LastfmError);
  });
});

describe("Spotify-Bibliothek", () => {
  it("neuer Endpunkt zuerst, bei 404 der alte", async () => {
    const calls: string[] = [];
    const call = async (p: string) => {
      calls.push(p);
      return p.startsWith("/me/library") ? new Response("", { status: 404 }) : Response.json([true]);
    };
    expect(await trackSaved(call, "4uLU6hMCjMI75M1A2tKUQC")).toBe(true);
    expect(calls).toEqual([
      "/me/library/contains?uris=spotify%3Atrack%3A4uLU6hMCjMI75M1A2tKUQC",
      "/me/tracks/contains?ids=4uLU6hMCjMI75M1A2tKUQC",
    ]);
  });

  it("Follows je Künstler; keiner antwortet → unbekannt; ungültige IDs ignoriert", async () => {
    const ok = async () => Response.json([true, false]);
    expect(await artistsFollowed(ok, ["0OdUWJ0sBjDrqHygGUXeCF", "1dfeR4HaWDbWqFHLkxsg1d", "name:lokal"])).toEqual({
      "0OdUWJ0sBjDrqHygGUXeCF": true,
      "1dfeR4HaWDbWqFHLkxsg1d": false,
    });
    const gone = async () => new Response("", { status: 403 });
    expect(await artistsFollowed(gone, ["0OdUWJ0sBjDrqHygGUXeCF"])).toEqual({});
    expect(await trackSaved(gone, "x")).toBeUndefined();
  });
});

describe("Persönliches zusammenführen", () => {
  const artists = [
    { id: "0OdUWJ0sBjDrqHygGUXeCF", name: "Queen" },
    { id: "1dfeR4HaWDbWqFHLkxsg1d", name: "Gast" },
  ];

  it("Spotify + Last.fm; fehlende Quellen lassen Werte weg", async () => {
    const spotify = async (p: string) => (p.includes("track") ? Response.json([true]) : Response.json([true, false]));
    const lastfm = createLastfm({ apiKey: "k", user: "u" }, lastfmHttp());
    const u = await userInfoFor({ trackId: "t", title: "Atemlos", artists }, { spotify, lastfm });
    expect(u).toEqual({
      trackSaved: true,
      trackPlays: 37,
      lovedOnLastfm: true,
      artists: {
        "0OdUWJ0sBjDrqHygGUXeCF": { following: true, plays: 432 },
        "1dfeR4HaWDbWqFHLkxsg1d": { following: false, plays: 432 },
      },
    });
    const ohne = await userInfoFor(
      { trackId: "t", title: "x", artists },
      { spotify: async () => new Response("", { status: 403 }), lastfm: null },
    );
    expect(ohne).toEqual({ artists: {} });
  });

  it("Verlauf: Last.fm, bei Fehler Spotify", async () => {
    const spotify = async () =>
      Response.json({
        items: [
          {
            played_at: "2026-11-14T18:00:00Z",
            track: { name: "Song", artists: [{ name: "A" }], album: { name: "Alb", images: [{ url: "img", width: 300 }] } },
          },
        ],
      });
    const broken = createLastfm(
      { apiKey: "k", user: "u" },
      lastfmHttp(() => ({ error: 10, message: "x" })),
    );
    const r = await recentTracks({ spotify, lastfm: broken });
    expect(r.source).toBe("spotify");
    expect(r.tracks[0]).toMatchObject({ title: "Song", artist: "A", imageUrl: "img" });
    expect((await recentTracks({ spotify, lastfm: createLastfm({ apiKey: "k", user: "u" }, lastfmHttp()) })).source).toBe(
      "lastfm",
    );
  });

  it("„vor … Min.“", () => {
    const now = 1_700_000_000_000;
    expect(ago(undefined, now)).toBe("läuft gerade");
    expect(ago(1_700_000_000 - 30, now)).toBe("gerade eben");
    expect(ago(1_700_000_000 - 600, now)).toBe("vor 10 Min.");
    expect(ago(1_700_000_000 - 3 * 3600, now)).toBe("vor 3 Std.");
    expect(ago(1_700_000_000 - 30 * 3600, now)).toBe("gestern");
  });
});

describe("Song merken", () => {
  it("speichert über den neuen Bibliotheks-Endpunkt, sonst /me/tracks; fehlende Berechtigung erkannt", async () => {
    const { saveTrack } = await import("@/lib/personal/spotify-library");
    const calls: Array<[string, string | undefined]> = [];
    const ok = await saveTrack(
      async (p, init) => {
        calls.push([p, init?.method]);
        return new Response(null, { status: p.startsWith("/me/library") ? 404 : 200 });
      },
      "4uLU6hMCjMI75M1A2tKUQC",
      true,
    );
    expect(ok).toBe(true);
    expect(calls).toEqual([
      ["/me/library?uris=spotify%3Atrack%3A4uLU6hMCjMI75M1A2tKUQC", "PUT"],
      ["/me/tracks?ids=4uLU6hMCjMI75M1A2tKUQC", "PUT"],
    ]);
    expect(await saveTrack(async () => new Response(null, { status: 403 }), "4uLU6hMCjMI75M1A2tKUQC", false)).toBe("scope");
    expect(await saveTrack(async () => new Response(null, { status: 500 }), "4uLU6hMCjMI75M1A2tKUQC", false)).toBe(false);
    expect(await saveTrack(async () => new Response(null), "kaputt", true)).toBe(false);
  });

  it("zeigt sofort an und nimmt bei Fehler zurück", async () => {
    const { setLiked } = await import("@/lib/personal/like");
    const { songContext } = await import("@/lib/song-context/store");
    const { neonlicht } = await import("@/lib/song-context/fixtures/neonlicht");
    songContext.getState().setSong({ ...neonlicht, user: { trackSaved: false, artists: {} } });
    const seen: Array<boolean | undefined> = [];
    const ok = await setLiked(true, (async (_u: string, init: RequestInit) => {
      seen.push(songContext.getState().song?.user?.trackSaved);
      expect(JSON.parse(init.body as string)).toEqual({ trackId: "demo-neonlicht", saved: true });
      return Response.json({ ok: true });
    }) as typeof fetch);
    expect(ok).toEqual({ ok: true });
    expect(seen).toEqual([true]); // schon vor der Antwort sichtbar
    const fail = await setLiked(false, (async () =>
      Response.json({ error: "Bitte neu anmelden", reauth: true }, { status: 403 })) as typeof fetch);
    expect(fail).toEqual({ ok: false, error: "Bitte neu anmelden", reauth: true });
    expect(songContext.getState().song?.user?.trackSaved).toBe(true); // zurückgenommen
    songContext.getState().setSong(null);
    expect(await setLiked(true)).toEqual({ ok: false, error: "Kein Song aktiv." });
  });
});
