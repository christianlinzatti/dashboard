import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyGermanTranslation } from "@/lib/lyrics/apply-translation";
import { memoryCache } from "@/lib/lyrics/cache";
import { needsGermanTranslation, secondLineFor } from "@/lib/lyrics/second-line";
import { foundKey } from "@/lib/lyrics/service";
import { createLyricsTranslator, uniqueLines, type Translate } from "@/lib/lyrics/translate";
import type { LyricLine, Lyrics } from "@/lib/song-context/schema";

const line = (text: string, i = 0): LyricLine => ({ startMs: i * 1000, endMs: i * 1000 + 900, text });
const lyrics = (texts: string[], extra: Partial<Lyrics> = {}): Lyrics => ({
  provider: "test",
  quality: "line",
  sections: [],
  lines: texts.map(line),
  ...extra,
});
const EN = [
  "I love you and you are the one",
  "you are the one for me tonight",
  "I don't want to be alone",
  "hold me in your arms",
  "I love you",
  "you are the one for me tonight",
];
const ES = [
  "Tú eres mi vida y yo te quiero",
  "mi amor por ti es tan grande",
  "no me dejes nunca más",
  "baila conmigo esta noche",
  "eres todo lo que tengo",
  "mi corazón es tuyo",
];
const DE = [
  "Ich will nicht, dass du gehst",
  "du bist mir so nah",
  "wir tanzen durch die Nacht",
  "und es ist noch nicht vorbei",
  "ich bin bei dir",
  "du und ich",
];

describe("Deutsche Übersetzung: wann", () => {
  it("nur bei nicht-deutschen Songs ohne deutsche Übersetzung", () => {
    expect(needsGermanTranslation(lyrics(EN))).toBe(true);
    expect(needsGermanTranslation(lyrics(ES))).toBe(true);
    expect(needsGermanTranslation(lyrics(["夜空に光る", "星のかけら", "君と二人", "いつまでも"]))).toBe(true);
    expect(needsGermanTranslation(lyrics(DE))).toBe(false);
    expect(needsGermanTranslation(lyrics(EN, { translationLang: "de-DE" }))).toBe(false); // schon deutsch dabei
    expect(needsGermanTranslation(lyrics(EN, { translationLang: "en" }))).toBe(true); // englische ersetzen
    expect(needsGermanTranslation(lyrics(["Oh yeah"]))).toBe(false); // zu wenig Text
    expect(needsGermanTranslation(null)).toBe(false);
  });

  it("einsetzen je Zeilentext, gekennzeichnet; zweite Zeile zeigt sie automatisch mit Hinweis", () => {
    const l = applyGermanTranslation(lyrics(EN, { translationLang: "en" }), {
      "I love you": "Ich liebe dich",
      "you are the one for me tonight": "du bist heute Nacht die Einzige für mich",
    });
    expect(l.translationLang).toBe("de");
    expect(l.translationSource).toBe("ki");
    expect(l.lines[1]!.translation).toBe("du bist heute Nacht die Einzige für mich");
    expect(l.lines[5]!.translation).toBe("du bist heute Nacht die Einzige für mich"); // Wiederholung
    expect(l.lines[0]!.translation).toBeUndefined();
    expect(secondLineFor(l, l.lines[4]!, "auto")).toMatchObject({ kind: "uebersetzung", text: "Ich liebe dich", machine: true });
    expect(needsGermanTranslation(l)).toBe(false); // kein zweites Mal
  });
});

describe("Deutsche Übersetzung: Server", () => {
  let cache: ReturnType<typeof memoryCache>;
  const translate = vi.fn<Translate>(async (texts) => ({ lines: texts.map((t) => `DE: ${t}`) }));
  beforeEach(async () => {
    cache = memoryCache();
    translate.mockClear();
  });
  const store = (key: string, l: Lyrics | null) => cache.set(foundKey(key), { lyrics: l }, 60);

  it("jede Zeile einmal übersetzt, Ergebnis gecacht; nur Text aus dem Lyrics-Cache", async () => {
    await store("t1", lyrics(EN));
    const de = createLyricsTranslator({ cache, translate, model: "m" });
    const r = await de("t1");
    expect(r).toMatchObject({ status: "ok", cached: false });
    expect(translate).toHaveBeenCalledWith(uniqueLines(lyrics(EN)));
    expect(uniqueLines(lyrics(EN))).toHaveLength(5); // Wiederholung nur einmal
    expect(r.status === "ok" && r.byText["I love you"]).toBe("DE: I love you");
    expect(await de("t1")).toMatchObject({ status: "ok", cached: true });
    expect(translate).toHaveBeenCalledTimes(1);
  });

  it("deutsche Songs, fehlender Text, keine KI", async () => {
    await store("de", lyrics(DE));
    const de = createLyricsTranslator({ cache, translate });
    expect(await de("de")).toEqual({ status: "unnoetig" });
    expect(await de("gibtsnicht")).toEqual({ status: "kein-text" });
    await store("en", lyrics(EN));
    expect(await createLyricsTranslator({ cache })("en")).toEqual({ status: "keine-ki" });
    expect(translate).not.toHaveBeenCalled();
  });

  it("abgelehnt/unbrauchbar wird gemerkt, Störungen nicht; gleichzeitige Anfragen teilen sich einen Aufruf", async () => {
    await store("es", lyrics(ES));
    const refuse = vi.fn<Translate>(async () => ({ lines: null, reason: "abgelehnt" }));
    const de = createLyricsTranslator({ cache, translate: refuse });
    expect(await de("es")).toMatchObject({ status: "fehler", reason: "abgelehnt" });
    expect(await de("es")).toMatchObject({ status: "fehler" });
    expect(refuse).toHaveBeenCalledTimes(1);

    const cache2 = memoryCache();
    await cache2.set(foundKey("es"), { lyrics: lyrics(ES) }, 60);
    const flaky = vi.fn<Translate>(async () => ({ lines: null, reason: "vorübergehend" }));
    const de2 = createLyricsTranslator({ cache: cache2, translate: flaky });
    await de2("es");
    await de2("es");
    expect(flaky).toHaveBeenCalledTimes(2);

    const cache3 = memoryCache();
    await cache3.set(foundKey("es"), { lyrics: lyrics(ES) }, 60);
    const slow = vi.fn<Translate>(async (texts) => ({ lines: texts }));
    const de3 = createLyricsTranslator({ cache: cache3, translate: slow });
    await Promise.all([de3("es"), de3("es"), de3("es")]);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it("Schnittstelle: nur angemeldet, nur mit Song-Schlüssel", async () => {
    vi.resetModules();
    vi.doMock("@/lib/server/session", () => ({ readSession: async () => null }));
    vi.doMock("@/lib/lyrics/translate", () => ({ germanLyricsFor: async () => ({ status: "unnoetig" }) }));
    const { NextRequest } = await import("next/server");
    let { GET } = await import("@/app/api/lyrics/translate/route");
    expect((await GET(new NextRequest("http://x/api/lyrics/translate?track=a"))).status).toBe(401);
    vi.resetModules();
    vi.doMock("@/lib/server/session", () => ({ readSession: async () => ({ uid: "u" }) }));
    ({ GET } = await import("@/app/api/lyrics/translate/route"));
    expect((await GET(new NextRequest("http://x/api/lyrics/translate"))).status).toBe(400);
    expect(await (await GET(new NextRequest("http://x/api/lyrics/translate?track=a"))).json()).toEqual({ status: "unnoetig" });
    vi.doUnmock("@/lib/server/session");
    vi.doUnmock("@/lib/lyrics/translate");
  });
});

describe("Deutsche Übersetzung: KI-Anbindung", () => {
  it("Claude: nummerierte Zeilen rein, gleich viele zurück; Ablehnung und falsche Anzahl erkannt", async () => {
    const { anthropicTranslator, TRANSLATE_SYSTEM_PROMPT } = await import("@/lib/lyrics/translate");
    const parse = vi.fn();
    const client = { beta: { messages: { parse } } } as unknown as import("@anthropic-ai/sdk").default;
    const t = anthropicTranslator(client, "m");
    parse.mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: { lines: ["1. Hallo", "Welt"] } });
    expect(await t(["Hello", "World"])).toEqual({ lines: ["Hallo", "Welt"] });
    const req = parse.mock.calls[0]![0];
    expect(req.system).toBe(TRANSLATE_SYSTEM_PROMPT);
    expect(req.messages[0].content).toBe("1. Hello\n2. World");
    parse.mockResolvedValueOnce({ stop_reason: "refusal", parsed_output: null });
    expect(await t(["Hello"])).toEqual({ lines: null, reason: "abgelehnt" });
    parse.mockResolvedValueOnce({ stop_reason: "end_turn", parsed_output: { lines: ["nur eine"] } });
    expect(await t(["a", "b"])).toEqual({ lines: null, reason: "ungültig" });
    parse.mockRejectedValueOnce(new Error("kaputt"));
    await expect(t(["a"])).rejects.toThrow("kaputt");
  });

  it("OpenAI: gleiches Verhalten", async () => {
    const { openAiTranslator } = await import("@/lib/lyrics/translate");
    const parse = vi.fn();
    const client = { chat: { completions: { parse } } } as unknown as import("openai").default;
    const t = openAiTranslator(client, "m");
    parse.mockResolvedValueOnce({ choices: [{ message: { parsed: { lines: ["Hallo"] } } }] });
    expect(await t(["Hello"])).toEqual({ lines: ["Hallo"] });
    parse.mockResolvedValueOnce({ choices: [{ message: { refusal: "nein" } }] });
    expect(await t(["Hello"])).toEqual({ lines: null, reason: "abgelehnt" });
    parse.mockResolvedValueOnce({ choices: [{ message: { parsed: { lines: [] } } }] });
    expect(await t(["Hello"])).toEqual({ lines: null, reason: "ungültig" });
  });
});
