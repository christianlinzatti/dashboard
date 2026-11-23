import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { lyricsSchema } from "@/lib/song-context/schema";
import { parseLrc } from "@/lib/lyrics/parse-lrc";
import { detectSections } from "@/lib/lyrics/sections";
import { estimateWords } from "@/lib/lyrics/word-timing";
import { cleanTitle, normalizeLine, syllables } from "@/lib/lyrics/text";
import { findLyrics, rank, toLyrics } from "@/lib/lyrics/chain";
import { createBreaker } from "@/lib/lyrics/breaker";
import { lrclib } from "@/lib/lyrics/providers/lrclib";
import { localOverrides } from "@/lib/lyrics/providers/local";
import { memoryCache, upstashCache } from "@/lib/lyrics/cache";
import type { LyricsProvider, ProviderResult, TrackQuery } from "@/lib/lyrics/types";

const q: TrackQuery = {
  trackKey: "t1",
  spotifyId: "abc123",
  title: "Lied",
  artists: ["Band"],
  album: "Album",
  durationMs: 180_000,
};

describe("Text-Hilfen", () => {
  it("Silben, Normalisierung, Titelbereinigung", () => {
    expect(syllables("Straßen")).toBe(2);
    expect(syllables("Bass")).toBe(1);
    expect(normalizeLine("Halt mich fest! (ooh)")).toBe("halt mich fest");
    expect(cleanTitle("Song (feat. X) - Remastered 2011")).toBe("Song");
    expect(cleanTitle("Song - Radio Edit")).toBe("Song");
    expect(cleanTitle("Song - Live")).toBe("Song");
  });
});

describe("LRC-Parser", () => {
  it("liest Zeilen, Offsets, Leerzeilen und Mehrfach-Zeitstempel", () => {
    const { lines, hasWords } = parseLrc(
      [
        "[ar: Band]",
        "[offset:+500]",
        "[00:10.50]Erste Zeile",
        "[00:14.00]",
        "[00:20.00][01:20.00]Refrain hier",
        "[00:24.30]Zweite",
      ].join("\n"),
      180_000,
    );
    expect(hasWords).toBe(false);
    expect(lines.map((l) => [l.startMs, l.text])).toEqual([
      [10_000, "Erste Zeile"],
      [19_500, "Refrain hier"],
      [23_800, "Zweite"],
      [79_500, "Refrain hier"],
    ]);
    // Leerzeile beendet die erste Zeile
    expect(lines[0]!.endMs).toBe(13_500);
  });

  it("liest Enhanced-LRC mit Wort-Timings", () => {
    const { lines, hasWords } = parseLrc(
      "[00:12.00]<00:12.00>Die <00:12.40>Straßen <00:13.10>glühen <00:14.00>\n[00:16.00]weiter",
    );
    expect(hasWords).toBe(true);
    expect(lines[0]!.text).toBe("Die Straßen glühen");
    expect(lines[0]!.words).toEqual([
      { startMs: 12_000, endMs: 12_400, text: "Die" },
      { startMs: 12_400, endMs: 13_100, text: "Straßen" },
      { startMs: 13_100, endMs: 14_000, text: "glühen" },
    ]);
    expect(lines[0]!.endMs).toBe(14_000);
  });

  it("akzeptiert ein- bis dreistellige Nachkommastellen", () => {
    const { lines } = parseLrc("[00:01.5]a\n[00:02.25]b\n[00:03.125]c");
    expect(lines.map((l) => l.startMs)).toEqual([1500, 2250, 3125]);
  });

  it("ignoriert Müll", () => {
    expect(parseLrc("kein lrc\n\n[xx]").lines).toEqual([]);
  });
});

describe("Wort-Schätzung", () => {
  it("verteilt nach Silben und bleibt in der Zeile", () => {
    const words = estimateWords({ startMs: 1000, endMs: 4000, text: "Wir tanzen unterm Neonlicht" });
    expect(words.map((w) => w.text)).toEqual(["Wir", "tanzen", "unterm", "Neonlicht"]);
    expect(words[0]!.startMs).toBe(1000);
    expect(words.at(-1)!.endMs).toBeLessThanOrEqual(4000);
    // „Neonlicht“ (2 Vokalgruppen) bekommt mehr Zeit als „Wir“ (1)
    const dur = (i: number) => words[i]!.endMs - words[i]!.startMs;
    expect(dur(3)).toBeGreaterThan(dur(0) * 1.5);
  });
});

describe("Abschnitts-Erkennung", () => {
  const L = (s: number, text: string, len = 3) => ({ startMs: s * 1000, endMs: (s + len) * 1000, text });
  const lines = [
    L(15, "Strophe eins a"),
    L(19, "Strophe eins b"),
    L(27, "Das ist der Refrain"),
    L(31, "Alle singen mit"),
    L(40, "Strophe zwei a"),
    L(44, "Strophe zwei b"),
    L(52, "Das ist der Refrain"),
    L(56, "Alle singen mit"),
    L(75, "Bridge allein"),
    L(95, "Das ist der Refrain"),
    L(99, "Alle singen mit"),
  ];

  it("erkennt Intro, Strophen, Refrains, Instrumental, Bridge und Outro", () => {
    const kinds = detectSections(lines, 150_000).map((s) => s.kind);
    expect(kinds).toEqual([
      "intro",
      "verse",
      "chorus",
      "verse",
      "chorus",
      "instrumental",
      "bridge",
      "instrumental",
      "chorus",
      "outro",
    ]);
  });

  it("Abschnitte sind lückenlos sortiert", () => {
    const secs = detectSections(lines, 150_000);
    for (let i = 1; i < secs.length; i++) expect(secs[i]!.startMs).toBeGreaterThanOrEqual(secs[i - 1]!.endMs - 1);
  });
});

function provider(
  id: string,
  priority: number,
  result: ProviderResult | null | Error,
  delay = 0,
  authoritative = false,
): LyricsProvider {
  return {
    id,
    priority,
    authoritative,
    search: vi.fn(async (_q, signal: AbortSignal) => {
      await new Promise((r, rej) => {
        const t = setTimeout(r, delay);
        signal.addEventListener("abort", () => (clearTimeout(t), rej(new Error("timeout"))));
      });
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}
const line = (text: string): ProviderResult["lines"][number] => ({ startMs: 1000, endMs: 3000, text });

describe("Provider-Kette", () => {
  it("bevorzugt Wort-Sync vor Zeilen-Sync, unabhängig von der Priorität", async () => {
    const r = await findLyrics(q, [
      provider("zeile", 1, { provider: "zeile", sync: "line", lines: [line("a b")] }),
      provider("wort", 9, { provider: "wort", sync: "word", lines: [{ ...line("a b"), words: [] }] }),
    ]);
    expect(r.lyrics?.provider).toBe("wort");
    expect(r.lyrics?.quality).toBe("word");
  });

  it("Zeilen-Sync wird zu geschätztem Wort-Sync mit Abschnitten", async () => {
    const r = await findLyrics(q, [
      provider("zeile", 1, { provider: "zeile", sync: "line", lines: [line("Hallo schöne Welt")] }),
    ]);
    expect(r.lyrics?.quality).toBe("word-estimated");
    expect(r.lyrics?.lines[0]!.words).toHaveLength(3);
    expect(() => lyricsSchema.parse(r.lyrics)).not.toThrow();
  });

  it("verwirft Treffer mit falscher Songdauer", async () => {
    const r = await findLyrics(q, [provider("x", 1, { provider: "x", sync: "line", lines: [line("a")], durationMs: 240_000 })]);
    expect(r.lyrics).toBeNull();
    expect(r.attempts[0]!.outcome).toBe("mismatch");
  });

  it("Timeouts und Fehler blockieren nicht; Circuit-Breaker pausiert Provider", async () => {
    const breaker = createBreaker({ threshold: 2, cooldownMs: 60_000 });
    const slow = provider("langsam", 1, { provider: "langsam", sync: "word", lines: [line("a")] }, 500);
    const broken = provider("kaputt", 1, new Error("500"));
    const ok = provider("ok", 5, { provider: "ok", sync: "line", lines: [line("a")] });
    const r = await findLyrics(q, [slow, broken, ok], { timeoutMs: 50, breaker });
    expect(r.lyrics?.provider).toBe("ok");
    expect(Object.fromEntries(r.attempts.map((a) => [a.provider, a.outcome]))).toEqual({
      langsam: "timeout",
      kaputt: "error",
      ok: "ok",
    });

    await findLyrics(q, [broken], { breaker });
    const third = await findLyrics(q, [broken], { breaker });
    expect(third.attempts[0]!.outcome).toBe("skipped");
  });

  it("meldet Instrumental, wenn niemand Text hat", async () => {
    const r = await findLyrics(q, [provider("x", 1, { provider: "x", sync: "plain", lines: [], instrumental: true })]);
    expect(r).toMatchObject({ lyrics: null, instrumental: true });
  });

  it("Ranking: maßgebliche (eigene) Lyrics gewinnen immer", () => {
    const own = { r: { provider: "lokal", sync: "line" as const, lines: [] }, p: provider("lokal", 0, null, 0, true) };
    const ext = { r: { provider: "x", sync: "word" as const, lines: [] }, p: provider("x", 1, null) };
    expect(rank([ext, own])[0]!.r.provider).toBe("lokal");
  });

  it("reiner Text bleibt ohne Timing", () => {
    expect(toLyrics({ provider: "x", sync: "plain", lines: [{ startMs: 0, endMs: 0, text: "a" }] }, q).quality).toBe("plain");
  });
});

describe("LRCLIB", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("nutzt /get mit Dauer und neutralem User-Agent", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      json({ id: 1, trackName: "Lied", artistName: "Band", duration: 180, syncedLyrics: "[00:01.00]Hallo\n[00:05.00]Welt" }),
    );
    const r = await lrclib(fetchMock as unknown as typeof fetch).search(
      { ...q, title: "Lied - Remastered" },
      new AbortController().signal,
    );
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe("/api/get");
    expect(url.searchParams.get("track_name")).toBe("Lied");
    expect(url.searchParams.get("duration")).toBe("180");
    expect((fetchMock.mock.calls[0]![1]!.headers as Record<string, string>)["User-Agent"]).toMatch(/^SonicStage/);
    expect(r).toMatchObject({ provider: "lrclib", sync: "line", durationMs: 180_000 });
    expect(r!.lines.map((l) => l.text)).toEqual(["Hallo", "Welt"]);
  });

  it("fällt auf /search zurück und nimmt synchronisierte Treffer mit passender Dauer", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/get")
        ? json({ message: "not found" }, 404)
        : json([
            { id: 1, trackName: "Lied", artistName: "Band", duration: 240, syncedLyrics: "[00:01.00]falsche Version" },
            { id: 2, trackName: "Lied", artistName: "Band", duration: 181, plainLyrics: "nur text" },
            { id: 3, trackName: "Lied", artistName: "Band", duration: 179, syncedLyrics: "[00:01.00]richtig" },
          ]),
    );
    const r = await lrclib(fetchMock as unknown as typeof fetch).search(q, new AbortController().signal);
    expect(r!.lines[0]!.text).toBe("richtig");
  });

  it("erkennt Instrumentals und Serverfehler", async () => {
    const instr = vi.fn(async () => json({ id: 1, trackName: "x", artistName: "y", duration: 180, instrumental: true }));
    expect((await lrclib(instr as unknown as typeof fetch).search(q, new AbortController().signal))?.instrumental).toBe(true);
    const err = vi.fn(async () => json({}, 500));
    await expect(lrclib(err as unknown as typeof fetch).search(q, new AbortController().signal)).rejects.toThrow("LRCLIB 500");
  });
});

describe("Eigene Lyrics-Dateien", () => {
  it("liest .lrc und .json aus dem Verzeichnis", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lyrics-"));
    await writeFile(path.join(dir, "abc123.lrc"), "[00:01.00]<00:01.00>Eigen <00:01.50>korrigiert <00:02.00>");
    const p = localOverrides(dir);
    expect(await p.search(q, new AbortController().signal)).toMatchObject({ provider: "lokal", sync: "word" });
    expect(await p.search({ ...q, spotifyId: "fehlt" }, new AbortController().signal)).toBeNull();
    expect(await p.search({ ...q, spotifyId: "../etc/passwd" }, new AbortController().signal)).toBeNull();

    await writeFile(
      path.join(dir, "duett1.json"),
      JSON.stringify({
        provider: "lokal",
        quality: "word",
        sections: [],
        singers: { v1: "a" },
        lines: [{ startMs: 0, endMs: 1000, text: "x", agent: "v1" }],
      }),
    );
    expect(await p.search({ ...q, spotifyId: "duett1" }, new AbortController().signal)).toMatchObject({ singers: { v1: "a" } });
  });
});

describe("Cache", () => {
  it("Speicher-Cache mit Ablauf und Größenlimit", async () => {
    const c = memoryCache(2);
    await c.set("a", 1, 60);
    await c.set("b", 2, 60);
    await c.set("c", 3, 60);
    expect(await c.get("a")).toBeNull();
    expect(await c.get("c")).toBe(3);
    await c.set("d", 4, -1);
    expect(await c.get("d")).toBeNull();
  });

  it("Upstash per REST", async () => {
    const store = new Map<string, string>();
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const [cmd, key, value] = JSON.parse(String(init!.body)) as string[];
      if (cmd === "SET") store.set(key!, value!);
      return new Response(JSON.stringify({ result: cmd === "GET" ? (store.get(key!) ?? null) : "OK" }));
    });
    const c = upstashCache("https://redis.example", "token", fetchMock as unknown as typeof fetch);
    await c.set("k", { a: 1 }, 60);
    expect(await c.get("k")).toEqual({ a: 1 });
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual(["SET", "k", '{"a":1}', "EX", 60]);

    // große Einträge komprimiert, kleine/alte unkomprimiert lesbar, Kaputtes → null
    const big = { lines: Array.from({ length: 200 }, (_, i) => ({ startMs: i * 1000, text: "Zeile mit etwas Text" })) };
    await c.set("gross", big, 60);
    const stored = String(JSON.parse(String(fetchMock.mock.calls.at(-1)![1]!.body))[2]);
    expect(stored.startsWith("gz:")).toBe(true);
    expect(stored.length).toBeLessThan(JSON.stringify(big).length / 3);
    expect(await c.get("gross")).toEqual(big);
    store.set("kaputt", "gz:nichtbase64!!");
    expect(await c.get("kaputt")).toBeNull();
  });

  it("Upstash hängt oder antwortet mit Fehler: Cache gilt als leer, Schreiben wird verworfen – nichts hängt", async () => {
    // hängt, bis das Timeout-Signal abbricht
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason))),
    );
    const slow = upstashCache("https://redis.example", "token", hang as unknown as typeof fetch, 30);
    const t0 = Date.now();
    expect(await slow.get("k")).toBeNull();
    await expect(slow.set("k", { a: 1 }, 60)).resolves.toBeUndefined();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(hang.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);

    const broken = upstashCache(
      "https://redis.example",
      "token",
      (async () => new Response("", { status: 503 })) as typeof fetch,
    );
    expect(await broken.get("k")).toBeNull();
    await expect(broken.set("k", 1, 60)).resolves.toBeUndefined();
  });
});
