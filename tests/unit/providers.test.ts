import { describe, expect, it, vi } from "vitest";
import { isSameTrack, overlap } from "@/lib/lyrics/match";
import { netease, parseYrc } from "@/lib/lyrics/providers/netease";
import { musixmatchDesktop } from "@/lib/lyrics/providers/musixmatch";
import { spotifyColor, totp, totpKey } from "@/lib/lyrics/providers/spotify-color";
import { activeProviders } from "@/lib/lyrics/service";
import type { TrackQuery } from "@/lib/lyrics/types";

const q: TrackQuery = { trackKey: "t", spotifyId: "4uLU6hMCjMI75M1A2tKUQC", title: "Leuchtfeuer", artists: ["Die Testband"], durationMs: 200_000 };
const signal = () => new AbortController().signal;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("Treffer-Prüfung", () => {
  it("akzeptiert denselben Song, auch mit Zusätzen", () => {
    expect(isSameTrack(q, { title: "Leuchtfeuer (feat. Gast) - Remastered", artists: ["Die Testband", "Gast"], durationMs: 201_000 })).toBe(true);
    expect(overlap("Die Testband", "Testband")).toBe(1);
  });
  it.each([
    ["anderer Titel", { title: "NOKIA", artists: ["Drake"] }],
    ["anderer Artist", { title: "Leuchtfeuer", artists: ["Jemand Anderes"] }],
    ["Live-Version", { title: "Leuchtfeuer (Live)", artists: ["Die Testband"] }],
    ["falsche Dauer", { title: "Leuchtfeuer", artists: ["Die Testband"], durationMs: 260_000 }],
  ])("verwirft %s", (_, c) => {
    expect(isSameTrack(q, c)).toBe(false);
  });
});

describe("NetEase", () => {
  const yrc = [
    '{"t":0,"c":[{"tx":"作词: "},{"tx":"Jemand"}]}',
    "[12000,2400](12000,500,0)Eins (12500,700,0)zwei (13200,1200,0)drei",
    "[15000,1000](15000,1000,0)vier",
    "[17000,900](17000,900,0)fünf",
  ].join("\n");

  it("liest YRC mit absoluten Wort-Zeiten und überspringt Metadaten", () => {
    const lines = parseYrc(yrc);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({
      startMs: 12_000,
      endMs: 14_400,
      text: "Eins zwei drei",
      words: [
        { startMs: 12_000, endMs: 12_500, text: "Eins" },
        { startMs: 12_500, endMs: 13_200, text: "zwei" },
        { startMs: 13_200, endMs: 14_400, text: "drei" },
      ],
    });
  });

  it("wählt den passenden Treffer (keine Live-Version) und liefert Wort-Sync", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (url) => {
      const u = String(url);
      if (u.includes("/search/get"))
        return json({
          result: {
            songs: [
              { id: 1, name: "Leuchtfeuer (Live)", duration: 250_000, artists: [{ name: "Die Testband" }] },
              { id: 2, name: "Leuchtfeuer", duration: 200_400, artists: [{ name: "Die Testband" }] },
            ],
          },
        });
      expect(u).toContain("id=2");
      return json({ lrc: { lyric: "[00:12.00]Eins zwei drei" }, yrc: { lyric: yrc } });
    });
    const r = await netease(fetchMock).search(q, signal());
    expect(r).toMatchObject({ provider: "netease", sync: "word", durationMs: 200_400 });
  });

  it("ohne passenden Treffer: null", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => json({ result: { songs: [{ id: 9, name: "Anderes Lied", artists: [{ name: "X" }] }] } }));
    expect(await netease(fetchMock).search(q, signal())).toBeNull();
  });
});

describe("Musixmatch Desktop", () => {
  const macro = (track: object, lrc = "[00:12.00]Eins\n[00:15.00]Zwei") => ({
    message: {
      header: { status_code: 200 },
      body: {
        macro_calls: {
          "matcher.track.get": { message: { header: { status_code: 200 }, body: { track } } },
          "track.subtitles.get": {
            message: { header: { status_code: 200 }, body: { subtitle_list: [{ subtitle: { subtitle_body: lrc } }] } },
          },
        },
      },
    },
  });
  const mock = (track: object) =>
    vi.fn<typeof fetch>(async (url) =>
      String(url).includes("token.get")
        ? json({ message: { header: { status_code: 200 }, body: { user_token: "tok" } } })
        : json(macro(track)),
    );

  it("liefert Zeilen-Sync für den richtigen Song", async () => {
    const f = mock({ track_name: "Leuchtfeuer", artist_name: "Die Testband", track_length: 200 });
    const r = await musixmatchDesktop(f).search(q, signal());
    expect(r).toMatchObject({ provider: "musixmatch", sync: "line" });
    const url = new URL(String(f.mock.calls.at(-1)![0]));
    expect(url.pathname).toContain("macro.subtitles.get");
    expect(url.searchParams.get("track_spotify_id")).toBe(`spotify:track:${q.spotifyId}`);
  });

  it("verwirft Lockvogel-Treffer (anderer Song)", async () => {
    expect(await musixmatchDesktop(mock({ track_name: "NOKIA", artist_name: "Drake", track_length: 241 })).search(q, signal())).toBeNull();
  });

  it("meldet Instrumentals", async () => {
    const r = await musixmatchDesktop(mock({ track_name: "Leuchtfeuer", artist_name: "Die Testband", instrumental: 1 })).search(q, signal());
    expect(r?.instrumental).toBe(true);
  });
});

describe("Spotify Color-Lyrics", () => {
  it("TOTP nach RFC 6238 (Testvektor)", () => {
    const key = Buffer.from("12345678901234567890");
    expect(totp(key, 59, 30, 8)).toBe("94287082");
    expect(totp(key, 1111111109, 30, 8)).toBe("07081804");
    expect(totp(key, 59)).toBe("287082");
  });

  it("transformiert das Spotify-Secret (XOR, Dezimal-String)", () => {
    expect(totpKey("[12, 56]").toString()).toBe(String(12 ^ 9) + String(56 ^ 10));
    expect(totpKey("RAWKEY").toString()).toBe("RAWKEY");
  });

  it("holt Token mit sp_dc + TOTP und liest Zeilen", async () => {
    const f = vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/server-time")) return json({ serverTime: 1_700_000_000 });
      if (u.includes("/api/token")) {
        expect((init!.headers as Record<string, string>).Cookie).toBe("sp_dc=geheim");
        expect(new URL(u).searchParams.get("totpVer")).toBe("7");
        expect(new URL(u).searchParams.get("totp")).toMatch(/^\d{6}$/);
        return json({ accessToken: "at", accessTokenExpirationTimestampMs: Date.now() + 3_600_000, isAnonymous: false });
      }
      expect(u).toContain(`/color-lyrics/v2/track/${q.spotifyId}`);
      return json({
        lyrics: {
          syncType: "LINE_SYNCED",
          lines: [
            { startTimeMs: "1000", words: "Eins", endTimeMs: "0" },
            { startTimeMs: "4000", words: "♪", endTimeMs: "0" },
            { startTimeMs: "6000", words: "Zwei", endTimeMs: "0" },
          ],
        },
      });
    });
    const r = await spotifyColor({ spDc: "geheim", totpSecret: "[1,2,3]", totpVersion: "7" }, f).search(q, signal());
    expect(r?.sync).toBe("line");
    expect(r?.lines.map((l) => [l.startMs, l.endMs, l.text])).toEqual([
      [1000, 4000, "Eins"],
      [6000, 10_000, "Zwei"],
    ]);
  });

  it("nutzt zuerst das Anmelde-Token, bei 403 sp_dc; ohne sp_dc kein Ergebnis", async () => {
    const calls: string[] = [];
    const f = vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url);
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? "";
      calls.push(u.includes("color-lyrics") ? `lyrics:${auth}` : u.includes("server-time") ? "time" : "token");
      if (u.endsWith("/server-time")) return json({ serverTime: 1_700_000_000 });
      if (u.includes("/api/token")) return json({ accessToken: "webplayer", accessTokenExpirationTimestampMs: Date.now() + 3_600_000 });
      if (auth === "Bearer app") return json({}, 403);
      return json({ lyrics: { syncType: "LINE_SYNCED", lines: [{ startTimeMs: "1000", words: "Eins" }] } });
    });
    const r = await spotifyColor({ spDc: "x", totpSecret: "k" }, f).search({ ...q, userAccessToken: "app" }, signal());
    expect(r?.lines).toHaveLength(1);
    expect(calls).toEqual(["lyrics:Bearer app", "time", "token", "lyrics:Bearer webplayer"]);

    const ohne = await spotifyColor({}, f).search({ ...q, userAccessToken: "app" }, signal());
    expect(ohne).toBeNull();
  });

  it("Anmelde-Token reicht, wenn Spotify es akzeptiert", async () => {
    const f = vi.fn<typeof fetch>(async () => json({ lyrics: { syncType: "LINE_SYNCED", lines: [{ startTimeMs: "1000", words: "Eins" }] } }));
    expect((await spotifyColor({}, f).search({ ...q, userAccessToken: "app" }, signal()))?.lines).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("anonymes Token (sp_dc ungültig) ist ein Fehler", async () => {
    const f = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("/server-time") ? json({ serverTime: 1 }) : json({ accessToken: "x", accessTokenExpirationTimestampMs: 0, isAnonymous: true }),
    );
    await expect(spotifyColor({ spDc: "x", totpSecret: "k", totpVersion: "1" }, f).search(q, signal())).rejects.toThrow(/sp_dc/);
  });
});

describe("Provider-Auswahl", () => {
  it("Standard: alle Provider, unbekannte werden ignoriert", () => {
    expect(activeProviders({}).map((p) => p.id)).toEqual(["musixmatch-desktop", "spotify-color", "netease", "lrclib"]);
    expect(activeProviders({ LYRICS_PROVIDERS: "lrclib, unbekannt" }).map((p) => p.id)).toEqual(["lrclib"]);
  });
});
