import { describe, expect, it, vi } from "vitest";
import { findLyrics, toLyrics } from "@/lib/lyrics/chain";
import { parseTtml, ttmlTime } from "@/lib/lyrics/parse-ttml";
import { betterLyrics, fromTtml, mapAgents } from "@/lib/lyrics/providers/better-lyrics";
import { activeProviders } from "@/lib/lyrics/service";
import type { TrackQuery } from "@/lib/lyrics/types";
import { derive, syllableProgress } from "@/lib/song-context/derive";
import { lyricsSchema } from "@/lib/song-context/schema";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import wordSynced from "../fixtures/better-lyrics/word-synced.json";
import keyRequired from "../fixtures/better-lyrics/api-key-required.json";

const q: TrackQuery = {
  trackKey: "t",
  title: "Blinding Lights",
  artists: ["The Weeknd"],
  artistIds: ["sp-weeknd"],
  album: "After Hours",
  durationMs: 200_040,
};
type Http = (url: string, init?: RequestInit) => Promise<Response>;
const ok = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

const tt = (body: string, head = "", timing = "Word") =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" itunes:timing="${timing}"><head><metadata>${head}</metadata></head><body dur="1:00.000">${body}</body></tt>`;

describe("TTML-Zeiten", () => {
  it("Sekunden, Minuten, Stunden, mit „s“", () => {
    expect(ttmlTime("27.395")).toBe(27_395);
    expect(ttmlTime("1:00.964")).toBe(60_964);
    expect(ttmlTime("1:02:03.5")).toBe(3_723_500);
    expect(ttmlTime("12.5s")).toBe(12_500);
    expect(ttmlTime("x")).toBeUndefined();
    expect(ttmlTime(undefined)).toBeUndefined();
  });
});

describe("Better Lyrics: Apple-Music-TTML (echte Struktur, Text anonymisiert)", () => {
  const doc = parseTtml(wordSynced.ttml, q.durationMs);
  it("Wort-Timing, alle Zeilen, Dauer aus <body dur>", () => {
    expect(doc.timing).toBe("word");
    expect(doc.lines).toHaveLength(35);
    expect(doc.durationMs).toBe(200_046);
    expect(doc.lines[0]).toMatchObject({ startMs: 27_395, endMs: 28_960, agent: "v1", text: "w1 w2 w3 w4" });
    expect(doc.lines.every((l) => l.words?.length)).toBe(true);
  });
  it("getrennte Silben werden ein Wort mit Silben-Timing", () => {
    const merged = doc.lines[1]!.words!.at(-1)!; // „e|nough“ im Original
    expect(merged.syllables!.map((x) => [x.startMs, x.endMs])).toEqual([
      [31_839, 31_996],
      [31_996, 32_529],
    ]);
    expect(merged.text).toBe(merged.syllables!.map((x) => x.text).join(""));
    expect(merged).toMatchObject({ startMs: 31_839, endMs: 32_529 });
    const all = doc.lines.flatMap((l) => l.words ?? []);
    expect(all.filter((w) => w.syllables).length).toBeGreaterThan(5); // kommt öfter vor
    expect(all.filter((w) => !w.syllables).every((w) => w.syllables === undefined)).toBe(true);
  });
  it("Hintergrundgesang fließt nicht in die Hauptzeile", () => {
    const withBg = wordSynced.ttml.match(/<p[^>]*itunes:key="L27"[^>]*>[\s\S]*?<\/p>/)![0];
    const main =
      (withBg.match(/<span begin/g) ?? []).length -
      (withBg.match(/x-bg[\s\S]*<\/span><\/span>/)![0].match(/<span begin/g) ?? []).length;
    expect(doc.lines.find((l) => l.startMs === 139_610)!.words).toHaveLength(main);
  });
  it("Abschnitte aus songPart, Lücken als Intro und Instrumental", () => {
    expect(doc.sections[0]).toEqual({ kind: "intro", startMs: 0, endMs: 27_395 });
    expect(doc.sections.map((s) => s.kind)).toEqual([
      "intro",
      "verse",
      "prechorus",
      "chorus",
      "instrumental",
      "verse",
      "prechorus",
      "chorus",
      "bridge",
      "chorus",
      "instrumental",
      "outro",
    ]);
    expect(doc.sections.at(-1)).toEqual({ kind: "outro", startMs: 184_342, endMs: 200_046 }); // bis zum Songende
    // lückenlos und aufsteigend
    doc.sections.slice(1).forEach((s, i) => expect(s.startMs).toBeGreaterThanOrEqual(doc.sections[i]!.endMs - 1));
  });
  it("Provider-Ergebnis: Wort-Sync mit Abschnitten, gültig im Song-Kontext", () => {
    const r = fromTtml(wordSynced.ttml, q)!;
    expect(r).toMatchObject({ provider: "better-lyrics", sync: "word", durationMs: 200_046 });
    expect(r.singers).toBeUndefined(); // nur ein Sänger
    const lyrics = toLyrics(r, q);
    expect(lyrics.sections).toBe(r.sections); // Provider-Abschnitte statt eigener Erkennung
    expect(() => lyricsSchema.parse(lyrics)).not.toThrow();
  });
});

describe("TTML-Sonderfälle", () => {
  it("Duett: Sänger über Namen, sonst in Reihenfolge; Gruppen ausgenommen", () => {
    const head =
      '<ttm:agent type="person" xml:id="v1"><ttm:name type="full">Kai Vento</ttm:name></ttm:agent>' +
      '<ttm:agent type="person" xml:id="v2"><ttm:name type="full">Mira Sol</ttm:name></ttm:agent>' +
      '<ttm:agent type="group" xml:id="v1000"/>';
    const body =
      '<div><p begin="1" end="2" ttm:agent="v1"><span begin="1" end="2">A</span></p>' +
      '<p begin="3" end="4" ttm:agent="v2"><span begin="3" end="4">B</span></p>' +
      '<p begin="5" end="6" ttm:agent="v1000"><span begin="5" end="6">C</span></p></div>';
    const doc = parseTtml(tt(body, head));
    expect(doc.agents).toEqual([
      { id: "v1", name: "Kai Vento" },
      { id: "v2", name: "Mira Sol" },
    ]);
    const duet: TrackQuery = { ...q, artists: ["Mira Sol", "Kai Vento"], artistIds: ["mira", "kai"] };
    expect(mapAgents(doc.agents, duet)).toEqual({ v1: "kai", v2: "mira" });
    expect(
      mapAgents(
        [
          { id: "v1", name: "Vocal 1" },
          { id: "v2", name: "Vocal 2" },
        ],
        duet,
      ),
    ).toEqual({ v1: "mira", v2: "kai" });
    expect(mapAgents([{ id: "v1" }, { id: "v2" }], { ...duet, artistIds: undefined })).toBeUndefined();
    expect(fromTtml(tt(body, head), duet)!.singers).toEqual({ v1: "kai", v2: "mira" });
  });
  it("Zeilen-Timing ohne Spans, Sonderzeichen, Silben-Timing ohne Leerzeichen", () => {
    const line = parseTtml(
      tt('<div><p begin="0:01.000" end="0:03.000">Rock &amp; Roll &apos;n&apos; mehr</p></div>', "", "Line"),
    );
    expect(line.timing).toBe("line");
    expect(line.lines[0]).toEqual({ startMs: 1000, endMs: 3000, text: "Rock & Roll 'n' mehr" });
    expect(fromTtml(tt('<div><p begin="1" end="3">Nur Zeile</p></div>', "", "Line"), q)!.sync).toBe("line");
    const syl = parseTtml(
      tt(
        '<div><p begin="1" end="4"><span begin="1" end="1.5">Wun</span><span begin="1.5" end="2">der</span> <span begin="2" end="4">bar</span></p></div>',
        "",
        "Syllable",
      ),
    );
    expect(syl.timing).toBe("word");
    expect(syl.lines[0]!.words!.map((w) => w.text)).toEqual(["Wunder", "bar"]);
    expect(syl.lines[0]!.words![0]!.syllables).toHaveLength(2);
    expect(parseTtml(tt("")).lines).toEqual([]);
    expect(fromTtml(tt(""), q)).toBeNull();
  });
});

describe("Karaoke-Füllung entlang der Silben", () => {
  const syl = [
    { startMs: 1000, endMs: 1200, text: "e" }, // kurz gesungen
    { startMs: 1200, endMs: 2000, text: "nough" }, // lang gezogen
  ];
  it("füllt jede Silbe in ihrer eigenen Zeit, nach Zeichen gewichtet", () => {
    expect(syllableProgress(syl, 900)).toBe(0);
    expect(syllableProgress(syl, 1100)).toBeCloseTo(0.5 / 6);
    expect(syllableProgress(syl, 1200)).toBeCloseTo(1 / 6);
    expect(syllableProgress(syl, 1600)).toBeCloseTo((1 + 2.5) / 6);
    expect(syllableProgress(syl, 2500)).toBe(1);
  });
  it("derive nutzt die Silben", () => {
    const song = structuredClone(neonlicht);
    const line = song.lyrics!.lines[0]!;
    const w = line.words![0]!;
    const mid = Math.round((w.startMs + w.endMs) / 2);
    w.syllables = [
      { startMs: w.startMs, endMs: mid, text: "x" },
      { startMs: mid, endMs: w.endMs, text: "yyyyyyy" },
    ];
    expect(derive(song, mid).wordProgress).toBeCloseTo(1 / 8);
  });
});

describe("Better-Lyrics-Provider", () => {
  it("Parameter wie dokumentiert, API-Key als Header, Treffer", async () => {
    const http = vi.fn<Http>(async () => ok(wordSynced));
    const r = await betterLyrics({ apiKey: "KEY", fetch: http as typeof fetch }).search(q, new AbortController().signal);
    const url = new URL(http.mock.calls[0]![0]);
    expect(url.origin + url.pathname).toBe("https://lyrics-api.boidu.dev/getLyrics");
    expect(Object.fromEntries(url.searchParams)).toEqual({ s: "Blinding Lights", a: "The Weeknd", al: "After Hours", d: "200" });
    expect(new Headers(http.mock.calls[0]![1]?.headers).get("x-api-key")).toBe("KEY");
    expect(r?.sync).toBe("word");
  });
  it("ohne Key: nicht im Cache des Dienstes (401) → kein Treffer; Serverfehler → Ausnahme", async () => {
    const p = (res: Response) => betterLyrics({ fetch: (async () => res) as typeof fetch });
    const http = vi.fn<Http>(async () => ok(keyRequired, 401));
    await betterLyrics({ fetch: http as typeof fetch }).search(q, new AbortController().signal);
    expect(new Headers(http.mock.calls[0]![1]?.headers).has("x-api-key")).toBe(false);
    expect(await p(ok(keyRequired, 401)).search(q, new AbortController().signal)).toBeNull();
    expect(await p(ok({ error: "Not found" }, 404)).search(q, new AbortController().signal)).toBeNull();
    expect(await p(ok({ error: "x" })).search(q, new AbortController().signal)).toBeNull();
    await expect(p(ok({}, 502)).search(q, new AbortController().signal)).rejects.toThrow("502");
  });
  it("ist Standard-Provider und gewinnt bei Wort-Sync die Kette", async () => {
    expect(activeProviders({}).map((p) => p.id)[0]).toBe("better-lyrics");
    const other = {
      id: "andere",
      priority: 20,
      search: async () => fromTtml(wordSynced.ttml, q)!.lines && { ...fromTtml(wordSynced.ttml, q)!, provider: "andere" },
    };
    const res = await findLyrics(q, [other, betterLyrics({ fetch: (async () => ok(wordSynced)) as typeof fetch })]);
    expect(res.lyrics?.provider).toBe("better-lyrics");
  });
});
