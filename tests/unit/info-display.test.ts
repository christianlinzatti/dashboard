import { describe, expect, it } from "vitest";
import { factAt, infoCardAt, infoEntries, wallPhoto } from "@/lib/info/display";
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
