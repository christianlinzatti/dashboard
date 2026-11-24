import { describe, expect, it } from "vitest";
import { parseTtml, parseWords } from "@/lib/lyrics/parse-ttml";
import { guessLyricsLang, hasSecondLine, isNonLatin, secondLineFill, secondLineFor } from "@/lib/lyrics/second-line";
import { hoshizora } from "@/lib/song-context/fixtures/hoshizora";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { lyricsSchema, type LyricLine } from "@/lib/song-context/schema";

const tt = (head: string, body: string, ns = "itunes") =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:${ns}="x" xmlns:ttm="y" ${ns}:timing="Word" xml:lang="ja"><head><metadata>${head}</metadata></head><body dur="1:00.000">${body}</body></tt>`;

describe("Umschrift und Übersetzung aus TTML", () => {
  // Beispiel aus der Better-Lyrics-Doku, ergänzt um eine Klammer außerhalb der Spans und eine Übersetzung
  const head = `<transliterations><transliteration xml:lang="ja-Latn"><text for="L10">
      <span begin="1:03.557" end="1:04.868">mayonaka no</span>
      <span begin="1:04.868" end="1:05.457">doa o</span>
      <span begin="1:05.457" end="1:05.930">tata</span><span begin="1:05.930" end="1:07.907">ki</span>)
    </text><text for="L11"><span begin="1:08" end="1:09">same text</span></text></transliteration></transliterations>
    <translations><translation type="subtitle" xml:lang="en-US"><text for="L10">Knocking on the door at midnight</text></translation></translations>`;
  const body = `<div itunes:songPart="Verse"><p begin="1:03.557" end="1:07.907" itunes:key="L10"><span begin="1:03.557" end="1:04.868">真夜中の</span><span begin="1:04.868" end="1:05.457">ドアを</span><span begin="1:05.457" end="1:07.907">叩き</span></p><p begin="1:08" end="1:09" itunes:key="L11"><span begin="1:08" end="1:09">same text</span></p></div>`;
  const doc = parseTtml(tt(head, body));

  it("Umschrift mit Timing, Silben und loser Klammer; nur bei abweichendem Text", () => {
    const l = doc.lines[0]!;
    expect(l.text).toBe("真夜中のドアを叩き"); // Japanisch ohne Leerzeichen: ein Wort mit Silben
    expect(l.transliteration!.text).toBe("mayonaka no doa o tataki)");
    expect(l.transliteration!.words!.map((w) => w.text)).toEqual(["mayonaka no", "doa o", "tataki)"]);
    expect(l.transliteration!.words![2]!.syllables!.map((x) => x.text)).toEqual(["tata", "ki)"]);
    expect(doc.lines[1]!.transliteration).toBeUndefined(); // gleicher Text → keine Umschrift
    expect(doc.transliterationLang).toBe("ja-Latn");
  });
  it("Übersetzung als Zeilentext mit Sprache", () => {
    expect(doc.lines[0]!.translation).toBe("Knocking on the door at midnight");
    expect(doc.translationLang).toBe("en-US");
  });
  it("Spans im Kopf zählen nicht als Liedzeilen", () => {
    expect(doc.lines).toHaveLength(2);
  });
  it("Quelle lrc.red: lrc:timing, lrc:key, lrc:songPart", () => {
    const lrc = parseTtml(
      tt(
        '<transliterations><transliteration xml:lang="ko-Latn"><text for="L1"><span begin="1" end="2">gang nam</span></text></transliteration></transliterations>',
        '<div lrc:songPart="Chorus" begin="1" end="2"><p begin="1" end="2" lrc:key="L1"><span begin="1" end="2">강남</span></p></div>',
        "lrc",
      ),
    );
    expect(lrc.sections.map((s) => s.kind)).toContain("chorus");
    expect(lrc.lines[0]!.transliteration!.text).toBe("gang nam");
  });
  it("markiertes Intro wird nicht verdoppelt", () => {
    const d = parseTtml(
      tt(
        "",
        '<div itunes:songPart="Intro" begin="5" end="9"><p begin="5" end="9"><span begin="5" end="9">a</span></p></div><div itunes:songPart="Verse" begin="9" end="20"><p begin="9" end="20"><span begin="9" end="20">b</span></p></div>',
      ),
    );
    expect(d.sections.slice(0, 2)).toEqual([
      { kind: "intro", startMs: 0, endMs: 9000 },
      { kind: "verse", startMs: 9000, endMs: 20_000 },
    ]);
  });
  it("lose Satzzeichen auch im Haupttext", () => {
    expect(parseWords('<span begin="1" end="2">(Back</span> <span begin="2" end="3">home</span>)!').text).toBe("(Back home)!");
  });
});

describe("Zweite Zeile: Auswahl", () => {
  const l = (p: Partial<LyricLine>): LyricLine => ({ startMs: 1000, endMs: 3000, text: "真夜中", ...p });
  const translit = { text: "mayonaka", words: [{ startMs: 1000, endMs: 3000, text: "mayonaka" }] };
  it("erkennt nicht-lateinische Schrift", () => {
    expect(["真夜中", "ドア", "강남", "Привет", "Γειά", "مرحبا"].every(isNonLatin)).toBe(true);
    expect(["Hello", "Grüß Gott", "Señor", "Ça va"].some(isNonLatin)).toBe(false);
  });
  it("automatisch: Umschrift bei fremder Schrift, sonst nur deutsche Übersetzung", () => {
    const meta = { transliterationLang: "ja-Latn", translationLang: "en-US" };
    expect(secondLineFor(meta, l({ transliteration: translit, translation: "Midnight" }), "auto")?.kind).toBe("umschrift");
    expect(secondLineFor(meta, l({ text: "Hello", translation: "Hallo" }), "auto")).toBeNull(); // Englisch nicht automatisch
    expect(secondLineFor({ translationLang: "de" }, l({ text: "Hola", translation: "Hallo" }), "auto")).toMatchObject({
      kind: "uebersetzung",
      text: "Hallo",
    });
  });
  it("automatisch: englische Übersetzung nur bei Songs, die weder deutsch noch englisch sind", () => {
    const song = (text: string) => ({
      translationLang: "en",
      lines: Array.from({ length: 8 }, () => l({ text, translation: "Translated" })),
    });
    const es = song("Tú eres mi vida y yo te quiero tanto mi amor");
    const en = song("I love you and you are the one for me tonight");
    const de = song("Ich will nicht, dass du gehst, du bist mir zu nah");
    expect(guessLyricsLang(es.lines)).toBe("anders");
    expect(guessLyricsLang(en.lines)).toBe("en");
    expect(guessLyricsLang(de.lines)).toBe("de");
    expect(guessLyricsLang([l({ text: "Hola" })])).toBe("unbekannt");
    expect(secondLineFor(es, es.lines[0]!, "auto")?.text).toBe("Translated");
    expect(secondLineFor(en, en.lines[0]!, "auto")).toBeNull();
    expect(secondLineFor(de, de.lines[0]!, "auto")).toBeNull();
  });
  it("erzwungen und aus", () => {
    const line = l({ transliteration: translit, translation: "Midnight" });
    expect(secondLineFor({}, line, "uebersetzung")?.text).toBe("Midnight");
    expect(secondLineFor({}, line, "umschrift")?.text).toBe("mayonaka");
    expect(secondLineFor({}, line, "aus")).toBeNull();
    expect(secondLineFor({}, l({}), "umschrift")).toBeNull();
  });
  it("Füllstand mit und ohne Wort-Timing", () => {
    const line = l({});
    expect(
      secondLineFill(
        line,
        {
          kind: "umschrift",
          text: "a b",
          words: [
            { startMs: 1000, endMs: 2000, text: "a" },
            { startMs: 2000, endMs: 3000, text: "b" },
          ],
        },
        2500,
      ),
    ).toEqual([1, 0.5]);
    expect(secondLineFill(line, { kind: "uebersetzung", text: "x" }, 2000)).toEqual([0.5]);
  });
  it("Demo-Song ist gültig und hat Umschrift und Übersetzung", () => {
    expect(() => lyricsSchema.parse(hoshizora.lyrics)).not.toThrow();
    expect(hasSecondLine(hoshizora.lyrics)).toBe(true);
    expect(hasSecondLine(neonlicht.lyrics)).toBe(false);
    expect(hoshizora.lyrics!.lines.every((x) => x.transliteration?.words?.length && x.translation)).toBe(true);
  });
});
