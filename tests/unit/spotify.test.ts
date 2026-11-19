import { describe, expect, it } from "vitest";
import { pkcePair, seal, unseal } from "@/lib/server/crypto";
import { measuredPosition, pollDelay, reconcilePosition } from "@/lib/spotify/clock";
import { pickCover, songFromTrack, trackKeyOf } from "@/lib/spotify/map";
import { applyNowPlaying, localDay } from "@/lib/spotify/sync";
import { spotifyTrackSchema, type NowPlaying, type SpotifyTrack } from "@/lib/spotify/types";
import { songStaticSchema } from "@/lib/song-context/schema";
import { createSongContextStore } from "@/lib/song-context/store";
import { createHash } from "node:crypto";

const SECRET = "x".repeat(40);

const track: SpotifyTrack = spotifyTrackSchema.parse({
  id: "4uLU6hMCjMI75M1A2tKUQC",
  type: "track",
  name: "Testlied (feat. Gast)",
  duration_ms: 200_000,
  explicit: false,
  artists: [
    { id: "a1", name: "Hauptkünstler" },
    { id: "a2", name: "Gast" },
  ],
  album: {
    name: "Album",
    images: [
      { url: "https://i.scdn.co/big", width: 1000, height: 1000 },
      { url: "https://i.scdn.co/mid", width: 640, height: 640 },
      { url: "https://i.scdn.co/small", width: 64, height: 64 },
    ],
  },
});

describe("Session-Verschlüsselung", () => {
  it("ver- und entschlüsselt", () => {
    // langer, eindeutiger Klartext: ein kurzer Wert wie „u1“ kann im Base64 zufällig vorkommen (flackernder Test)
    const uid = "klartext-benutzer-0815";
    const token = seal({ uid, n: 42 }, SECRET);
    expect(unseal(token, SECRET)).toEqual({ uid, n: 42 });
    expect(token).not.toContain(uid);
    expect(Buffer.from(token.replace(/\./g, ""), "base64url").toString("latin1")).not.toContain(uid);
    expect(token).not.toContain(Buffer.from(JSON.stringify({ uid })).toString("base64url").slice(0, 12));
  });

  it("erkennt Manipulation und falschen Schlüssel", () => {
    const token = seal({ uid: "u1" }, SECRET);
    const [iv, tag, body] = token.split(".");
    const flipped = body!.slice(0, -2) + (body!.endsWith("AA") ? "BB" : "AA");
    expect(unseal(`${iv}.${tag}.${flipped}`, SECRET)).toBeNull();
    expect(unseal(token, "y".repeat(40))).toBeNull();
    expect(unseal("kaputt", SECRET)).toBeNull();
    expect(unseal(undefined, SECRET)).toBeNull();
  });

  it("verlangt ein ausreichend langes Secret", () => {
    expect(() => seal({}, "kurz")).toThrow(/SESSION_SECRET/);
  });

  it("PKCE-Challenge ist SHA-256 des Verifiers", () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
  });
});

describe("Spotify → Song-Kontext", () => {
  it("baut gültige Stammdaten mit Feature-Erkennung und Besetzung", () => {
    const song = songFromTrack(track);
    expect(() => songStaticSchema.parse(song)).not.toThrow();
    expect(song.trackKey).toBe(track.id);
    expect(song.track.isFeature).toBe(true);
    expect(song.artists.map((a) => a.role)).toEqual(["main", "feature"]);
    expect(song.cast.filter((c) => c.artistId).map((c) => c.artistId)).toEqual(["a1", "a2"]);
    expect(new Set(song.artists.map((a) => a.avatarId)).size).toBe(2);
    expect(song.album.coverUrl).toBe("https://i.scdn.co/mid");
    expect(song.status.palette?.state).toBe("loading");
  });

  it("erkennt Features auch nur am Titel", () => {
    const solo = { ...track, name: "Lied (feat. Jemand)", artists: [track.artists[0]!] };
    expect(songFromTrack(solo).track.isFeature).toBe(true);
    expect(songFromTrack({ ...solo, name: "Lied" }).track.isFeature).toBe(false);
  });

  it("lokale Dateien ohne ID bekommen einen stabilen Schlüssel", () => {
    const local = { ...track, id: null };
    expect(trackKeyOf(local)).toBe(trackKeyOf(local));
    expect(trackKeyOf(local)).toMatch(/^local:/);
  });

  it("pickCover nimmt das größte Bild ≤ 640 px", () => {
    expect(pickCover([])).toBe("");
    expect(pickCover([{ url: "a", width: 1000 }])).toBe("a");
  });
});

describe("Songzeit-Abgleich", () => {
  it("kleine Abweichungen sanft, große sofort", () => {
    expect(reconcilePosition(10_000, 10_020)).toBe(10_000);
    expect(reconcilePosition(10_000, 10_400)).toBeCloseTo(10_140);
    expect(reconcilePosition(10_000, 30_000)).toBe(30_000);
  });

  it("kompensiert die halbe Round-Trip-Zeit", () => {
    expect(measuredPosition(5000, 200)).toBe(5100);
    expect(measuredPosition(5000, -5)).toBe(5000);
  });

  it("fragt kurz vor Songende häufiger ab", () => {
    expect(pollDelay({ isPlaying: true, remainingMs: 60_000 })).toBe(3000);
    expect(pollDelay({ isPlaying: true, remainingMs: 3000 })).toBe(1000);
    expect(pollDelay({ isPlaying: false, remainingMs: 3000 })).toBe(4000);
  });
});

describe("applyNowPlaying", () => {
  const playing = (progressMs: number, state: "playing" | "paused" = "playing"): NowPlaying => ({
    state,
    progressMs,
    fetchedAt: 0,
    track,
  });

  it("setzt neuen Song und Position", () => {
    const store = createSongContextStore();
    expect(applyNowPlaying(store, playing(40_000), 100, 1000).newTrack).toBe(true);
    const s = store.getState();
    expect(s.song?.track.title).toBe("Testlied (feat. Gast)");
    expect(s.playback).toMatchObject({ isPlaying: true, positionMs: 40_050, updatedAt: 1000 });
  });

  it("Tagesform nach dem echten Kalendertag, nicht nach der Messuhr", () => {
    const store = createSongContextStore();
    // Messuhr (performance.now) zählt ab Seitenstart – früher wurde daraus immer 1970-01-01
    applyNowPlaying(store, playing(40_000), 100, 1000, new Date(2026, 10, 19, 0, 30).getTime());
    expect(store.getState().song?.variant).toBe("2026-11-19");
    expect(localDay(new Date(2026, 0, 5, 23, 59).getTime())).toBe("2026-01-05");
  });

  it("korrigiert bei gleichem Song sanft statt zu springen", () => {
    const store = createSongContextStore();
    applyNowPlaying(store, playing(40_000), 0, 1000);
    // 3 s später meldet Spotify 300 ms mehr als erwartet
    expect(applyNowPlaying(store, playing(43_300), 0, 4000).newTrack).toBe(false);
    expect(store.getState().playback.positionMs).toBeCloseTo(43_105);
  });

  it("übernimmt Pause sofort und leert bei Stille", () => {
    const store = createSongContextStore();
    applyNowPlaying(store, playing(40_000), 0, 1000);
    applyNowPlaying(store, playing(41_000, "paused"), 0, 2500);
    expect(store.getState().playback).toMatchObject({ isPlaying: false, positionMs: 41_000 });
    applyNowPlaying(store, { state: "idle" }, 0, 3000);
    expect(store.getState().song).toBeNull();
  });
});
