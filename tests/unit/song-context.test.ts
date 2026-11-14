import { describe, expect, it, vi } from "vitest";
import { songStaticSchema } from "@/lib/song-context/schema";
import { derive, lastStartedIndex, positionAt } from "@/lib/song-context/derive";
import { createSongContextStore } from "@/lib/song-context/store";
import { fixtures } from "@/lib/song-context/fixtures";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { abendrot } from "@/lib/song-context/fixtures/abendrot";
import { instrumental } from "@/lib/song-context/fixtures/instrumental";

describe("Schema", () => {
  it.each(Object.entries(fixtures))("Fixture %s ist ein gültiger Song-Kontext", (_, fx) => {
    expect(() => songStaticSchema.parse(fx)).not.toThrow();
  });

  it("Wort-Timings liegen innerhalb ihrer Zeile und sind aufsteigend", () => {
    for (const line of neonlicht.lyrics!.lines) {
      let prev = line.startMs;
      for (const w of line.words ?? []) {
        expect(w.startMs).toBeGreaterThanOrEqual(prev);
        expect(w.endMs).toBeLessThanOrEqual(line.endMs);
        prev = w.startMs;
      }
    }
  });

  it("lehnt unvollständige Daten ab", () => {
    expect(songStaticSchema.safeParse({ ...neonlicht, artists: [] }).success).toBe(false);
  });
});

describe("derive", () => {
  it("findet Zeile, Wort, Abschnitt und Sänger", () => {
    const d = derive(neonlicht, 64_100); // 2. Strophe, Kai Vento singt
    expect(d.lineActive).toBe(true);
    expect(neonlicht.lyrics!.lines[d.lineIdx]!.text).toBe("der ganze Block, er weiß Bescheid");
    expect(d.wordIdx).toBe(0);
    expect(d.section).toBe("verse");
    expect(d.isChorus).toBe(false);
    expect(d.activeSingerId).toBe("demo-kai");
  });

  it("erkennt den Refrain", () => {
    const d = derive(neonlicht, 41_000);
    expect(d.section).toBe("chorus");
    expect(d.isChorus).toBe(true);
    expect(d.activeSingerId).toBe("demo-mira");
  });

  it("liefert in Pausen die Zeit bis zur nächsten Zeile", () => {
    const d = derive(neonlicht, 37_000);
    expect(d.lineActive).toBe(false);
    expect(d.secondsToNextLyric).toBeCloseTo(3.5);
  });

  it("vor der ersten Zeile ist lineIdx -1", () => {
    const d = derive(neonlicht, 2_000);
    expect(d.lineIdx).toBe(-1);
    expect(d.section).toBe("intro");
    expect(d.secondsToNextLyric).toBeCloseTo(10.5);
  });

  it("Zeilen-Sync: Fortschritt über die ganze Zeile", () => {
    const line = abendrot.lyrics!.lines[0]!;
    const d = derive(abendrot, (line.startMs + line.endMs) / 2);
    expect(d.wordIdx).toBe(-1);
    expect(d.wordProgress).toBeCloseTo(0.5);
  });

  it("ohne Lyrics bleibt alles leer", () => {
    const d = derive(instrumental, 30_000);
    expect(d.lineIdx).toBe(-1);
    expect(d.section).toBeNull();
  });

  it("lastStartedIndex sucht binär", () => {
    const items = [0, 10, 20, 30].map((startMs) => ({ startMs }));
    expect(lastStartedIndex(items, -1)).toBe(-1);
    expect(lastStartedIndex(items, 0)).toBe(0);
    expect(lastStartedIndex(items, 25)).toBe(2);
    expect(lastStartedIndex(items, 99)).toBe(3);
  });

  it("positionAt interpoliert nur bei laufender Wiedergabe und begrenzt auf die Dauer", () => {
    const pb = { isPlaying: true, positionMs: 1000, updatedAt: 500, offsetMs: 0 };
    expect(positionAt(pb, 1500)).toBe(2000);
    expect(positionAt({ ...pb, isPlaying: false }, 1500)).toBe(1000);
    expect(positionAt(pb, 1e9, 3000)).toBe(3000);
  });
});

describe("Store", () => {
  it("löst Ereignisse bei Songwechsel, Abschnitt, Refrain und Sänger aus", () => {
    const store = createSongContextStore();
    const seen: string[] = [];
    for (const e of ["trackChanged", "lyricsReady", "sectionChanged", "chorusStart", "singerChanged"] as const)
      store.events.on(e, () => seen.push(e));

    const s = store.getState();
    s.setSong(neonlicht);
    s.setFrozen(true);
    s.setPlayback({ positionMs: 41_000 });
    s.tick(0);

    expect(seen).toEqual(["trackChanged", "lyricsReady", "sectionChanged", "chorusStart", "singerChanged"]);
    expect(store.getState().derived.isChorus).toBe(true);
  });

  it("berücksichtigt den Lyrics-Offset", () => {
    const store = createSongContextStore();
    const s = store.getState();
    s.setSong(neonlicht);
    s.setFrozen(true);
    s.setPlayback({ positionMs: 12_700, offsetMs: 500 }); // effektiv 12.2 s → noch vor der ersten Zeile
    s.tick(0);
    expect(store.getState().derived.lineIdx).toBe(-1);
    s.setPlayback({ offsetMs: 0 });
    s.tick(0);
    expect(store.getState().derived.lineIdx).toBe(0);
  });

  it("mergeSong reichert an und meldet nachgelieferte Lyrics", () => {
    const store = createSongContextStore();
    const onLyrics = vi.fn();
    store.events.on("lyricsReady", onLyrics);
    const { lyrics, ...withoutLyrics } = neonlicht;
    store.getState().setSong(withoutLyrics);
    expect(onLyrics).not.toHaveBeenCalled();
    store.getState().mergeSong({ lyrics, status: { lyrics: { state: "ok" } } });
    expect(onLyrics).toHaveBeenCalledWith({ quality: "word" });
    expect(store.getState().song?.status.spotify?.state).toBe("ok");
  });

  it("meldet Pause und Fortsetzen", () => {
    const store = createSongContextStore();
    const seen: string[] = [];
    store.events.on("paused", () => seen.push("paused"));
    store.events.on("resumed", () => seen.push("resumed"));
    store.getState().setPlayback({ isPlaying: true });
    store.getState().setPlayback({ isPlaying: false });
    expect(seen).toEqual(["resumed", "paused"]);
  });
});
