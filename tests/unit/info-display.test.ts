import { describe, expect, it } from "vitest";
import {
  CARD_ROTATE_MS,
  factAt,
  infoCardAt,
  infoEntries,
  wallPhoto,
  WALL_PHOTOS_MAX,
  wallPhotoCredit,
  wallPhotos,
} from "@/lib/info/display";
import type { Photo } from "@/lib/song-context/schema";
import { derive } from "@/lib/song-context/derive";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { instrumental } from "@/lib/song-context/fixtures/instrumental";

const at = (t: number) => infoCardAt(neonlicht, derive(neonlicht, t), t);

describe("Info-Anzeige", () => {
  it("Einträge in Song-Reihenfolge mit Foto", () => {
    expect(infoEntries(neonlicht).map((e) => [e.name, !!e.photo])).toEqual([
      ["Mira Sol", true],
      ["Kai Vento", true],
    ]);
    expect(infoEntries(instrumental)).toEqual([]);
  });

  it("Infokarte im Intro (abwechselnd), nicht während gesungen wird", () => {
    expect(at(3000)?.name).toBe("Mira Sol");
    expect(infoCardAt(neonlicht, derive(neonlicht, 3000), 12_500)?.name).toBe("Kai Vento");
    expect(at(46_000)).toBeNull(); // Refrain, Zeile aktiv
    expect(at(180_000)?.name).toBeDefined(); // Outro
  });

  it("Fakten-Ticker nur in Strophen und nur im Zeitfenster", () => {
    const d = (t: number) => factAt(neonlicht, derive(neonlicht, t), t);
    expect(d(24_000 + 1000)).toMatch(/·/); // Strophe, Fenster offen
    expect(d(24_000 + 9000)).toBeNull(); // Fenster zu
    expect(d(46_000)).toBeNull(); // Refrain
  });

  it("ähnliche Künstler kommen als Fakt in die Runde", () => {
    const song = { ...neonlicht, user: { ...neonlicht.user!, similar: ["A", "B", "C", "D"] } };
    const seen = new Set<string | null>();
    for (let t = 0; t < song.track.durationMs; t += 1000) seen.add(factAt(song, derive(song, t), t));
    expect(seen).toContain(`Ähnlich wie ${song.artists[0]!.name} · A, B, C`);
  });

  it("Wandfoto gehört dem Lead", () => {
    expect(wallPhoto(neonlicht)?.url).toBe("/demo/mira-sol.svg");
    expect(wallPhoto(instrumental)).toBeNull();
  });
});

describe("Fotos: alle kommen dran", () => {
  const photo = (artistId: string, source: Photo["source"], kind: Photo["kind"], w: number, h: number, n: string): Photo => ({
    url: `https://x/${n}.jpg`,
    width: w,
    height: h,
    source,
    kind,
    credit: `Urheber ${n}`,
    license: source === "commons" ? "CC BY-SA 4.0" : "TheAudioDB",
    sourceUrl: "s",
    artistId,
  });
  // wie bei Queen: vier Bühnenbilder und ein Porträt von TheAudioDB, ein Foto von Wikipedia/Commons
  const photos = [
    photo("demo-mira", "commons", "photo", 1280, 1000, "wiki"),
    ...[1, 2, 3, 4].map((i) => photo("demo-mira", "theaudiodb", "fanart", 1280, 720, `fanart${i}`)),
    photo("demo-mira", "theaudiodb", "thumb", 700, 700, "thumb"),
    photo("demo-mira", "theaudiodb", "thumb", 600, 900, "hoch"),
    photo("demo-kai", "commons", "photo", 1200, 800, "kai"),
  ];
  const song = { ...neonlicht, info: { ...neonlicht.info!, photos } };

  it("Wikipedia-Foto steht vorn (nicht erst nach vier Bühnenbildern), Feature-Gast danach, kein Hochformat", () => {
    const names = wallPhotos(song).map((p) => p.url.split("/").pop());
    expect(names.slice(0, 2)).toEqual(["fanart1.jpg", "wiki.jpg"]);
    expect(names).toContain("kai.jpg");
    expect(names.indexOf("kai.jpg")).toBeGreaterThan(names.indexOf("fanart4.jpg")); // Lead zuerst
    expect(names).not.toContain("hoch.jpg");
    expect(wallPhotos(song).length).toBeLessThanOrEqual(WALL_PHOTOS_MAX);
  });

  it("Bildnachweis fürs Wandfoto, nicht für Demo-Bilder", () => {
    const at = (t: number) => wallPhotoCredit(song, t);
    expect(at(0)).toBe("Foto: Urheber fanart1 · TheAudioDB");
    const secondSection = song.lyrics!.sections[1]!.startMs;
    expect(at(secondSection)).toBe("Foto: Urheber wiki · CC BY-SA 4.0");
    expect(wallPhotoCredit(neonlicht, 0)).toBeNull();
  });

  it("Infokarte zeigt bei jedem Auftritt das nächste Foto des Artists, Wikipedia als zweites", () => {
    const card = (t: number) => infoCardAt(song, derive(song, 3000), t);
    const seen = [0, 1, 2, 3].map((round) =>
      card(round * 2 * CARD_ROTATE_MS + 100)
        ?.photo?.url.split("/")
        .pop(),
    );
    expect(seen[0]).toBe("thumb.jpg");
    expect(seen[1]).toBe("wiki.jpg");
    expect(new Set(seen).size).toBe(4);
    expect(card(CARD_ROTATE_MS + 100)?.name).toBe("Kai Vento");
    expect(card(CARD_ROTATE_MS + 100)?.photo?.url).toContain("kai.jpg");
  });
});
