import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { showPatch, showUrl, type ShowPayload } from "@/components/show/useShowLoader";
import { planChoreography } from "@/lib/dance/plan";
import { memoryCache } from "@/lib/lyrics/cache";
import { planLyricsEffects } from "@/lib/lyrics/director";
import { foundKey } from "@/lib/lyrics/service";
import { briefFor, energyLevel, sanitizeBrief, type ShowBrief } from "@/lib/show/brief";
import { createShowDirector, DEFAULT_SHOW_MODEL, describeSong, SHOW_SYSTEM_PROMPT, type SongFacts } from "@/lib/show/director";
import { createShowService, lyricsExcerpt } from "@/lib/show/service";
import { audioDbTags, cleanTags, collectTags, lastfmTags, moodFrom } from "@/lib/show/tags";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { songStaticSchema } from "@/lib/song-context/schema";
import { crowdAt, crowdProfile } from "@/lib/stage/crowd";
import { planEffects } from "@/lib/stage/effects";
import { THEMES, themeFor } from "@/lib/stage/themes";

const brief: ShowBrief = {
  stage: "weltraum",
  mood: "ruhig",
  genres: ["dream pop", "synthpop"],
  motto: "Ein Tanz zwischen den Sternen.",
  sections: [
    { kind: "intro", energy: "ruhig", lyrics: "gluehen", crowd: "handys", effects: ["sternschnuppen"] },
    { kind: "verse", energy: "mittel", lyrics: "welle", crowd: "wiegen", effects: [] },
    { kind: "chorus", energy: "hoch", lyrics: "neon", crowd: "haende", effects: ["co2"] },
    { kind: "bridge", energy: "ruhig", lyrics: "echo", crowd: "handys", effects: ["pyro"] },
    { kind: "outro", energy: "ruhig", lyrics: "gluehen", crowd: "handys", effects: [] },
  ],
};
type Http = (url: string) => Promise<Response>;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe("Regieanweisung (Brief)", () => {
  it("wird gesäubert: Genres klein und begrenzt, doppelte Abschnitte raus, Unsinn abgelehnt", () => {
    const messy = {
      ...brief,
      genres: [" Dream Pop ", "dream pop", "a", "b", "c", "d", "e", "f"],
      motto: `  viel\n zu ${"lang ".repeat(60)}`,
      sections: [
        ...brief.sections,
        {
          ...brief.sections[2]!,
          energy: "hoehepunkt" as const,
          effects: ["co2", "co2", "pyro", "funken", "ringe", "konfetti"] as const,
        },
      ],
    };
    const clean = sanitizeBrief(messy)!;
    expect(clean.genres).toEqual(["dream pop", "a", "b", "c", "d", "e"]);
    expect(clean.motto.length).toBeLessThanOrEqual(160);
    expect(clean.sections.filter((s) => s.kind === "chorus")).toHaveLength(1);
    expect(briefFor(clean, "chorus")!.energy).toBe("hoch"); // der erste Eintrag gilt
    expect(sanitizeBrief({ ...brief, stage: "mond" })).toBeNull();
    expect(sanitizeBrief(null)).toBeNull();
    expect(energyLevel("hoehepunkt")).toBe(3);
    expect(briefFor(undefined, "chorus")).toBeUndefined();
    // Song mit Brief ist ein gültiger Song-Kontext
    expect(() => songStaticSchema.parse({ ...neonlicht, show: brief, variant: "2026-11-16" })).not.toThrow();
  });

  it("steuert Bühne, Energie, Publikum, Effekte und Schrift", () => {
    const song = { ...neonlicht, show: brief };
    expect(themeFor(song)).toBe("weltraum");
    expect(themeFor(song, "jazz")).toBe("jazz"); // feste Wahl bleibt
    const plan = planChoreography(song, 124);
    for (const p of plan.phrases) {
      const d = briefFor(brief, p.section);
      if (!d) continue;
      expect(p.energy).toBe(energyLevel(d.energy));
      expect(p.crowd).toBe(d.crowd);
      expect(p.effects).toEqual(d.effects);
    }
    // Publikum: Regie schlägt die Regeln (Refrain mit „Hände“ statt Springen)
    const chorus = plan.phrases.find((p) => p.section === "chorus")!;
    expect(crowdProfile(chorus)).toMatchObject({ jump: 0.2, bandMode: 2 });
    expect(crowdAt(plan, (chorus.startMs + chorus.endMs) / 2).jump).toBeCloseTo(0.2);
    // Effekte: Wunsch-Effekt zum Refrain, Pyro zur Bridge (sonst gäbe es dort keinen Knall), Strophe ausdrücklich ohne
    const cues = planEffects(plan, THEMES.weltraum);
    const at = (kind: string) => plan.phrases.filter((p, i) => p.section === kind && plan.phrases[i - 1]?.section !== kind);
    for (const p of at("chorus")) expect(cues.some((c) => c.startMs === p.startMs && c.kind === "co2")).toBe(true);
    for (const p of at("bridge")) expect(cues.some((c) => c.startMs === p.startMs && c.kind === "pyro")).toBe(true);
    for (const p of at("verse"))
      expect(cues.some((c) => c.startMs === p.startMs && ["pyro", "co2", "funken"].includes(c.kind))).toBe(false);
    // Schrift: Strophe Welle, erster Refrain Neon
    const fx = planLyricsEffects(song);
    const kindOf = (i: number) =>
      song.lyrics!.sections.find((s) => song.lyrics!.lines[i]!.startMs >= s.startMs && song.lyrics!.lines[i]!.startMs < s.endMs)
        ?.kind;
    expect(fx[song.lyrics!.lines.findIndex((_, i) => kindOf(i) === "verse")]).toBe("welle");
    expect(fx[song.lyrics!.lines.findIndex((_, i) => kindOf(i) === "chorus")]).toBe("neon");
    // ohne Brief bleibt alles wie zuvor
    expect(planChoreography(neonlicht, 124).phrases.every((p) => p.crowd === undefined && p.effects === undefined)).toBe(true);
  });

  it("Tagesform: derselbe Song an einem anderen Tag – andere Auswahl, aber wiederholbar", () => {
    const clips = (variant?: string) =>
      planChoreography({ ...neonlicht, variant }, 124).phrases.map((p) =>
        Object.values(p.moves)
          .map((m) => m.clip)
          .join(),
      );
    expect(clips("2026-11-16")).toEqual(clips("2026-11-16"));
    expect(clips("2026-11-16")).not.toEqual(clips("2026-11-17"));
    expect(clips(undefined)).toEqual(clips(undefined));
    const bare = { ...neonlicht, music: { genres: [] }, artists: neonlicht.artists.map((a) => ({ ...a, genres: [] })) };
    const stages = new Set(Array.from({ length: 14 }, (_, d) => themeFor({ ...bare, variant: `2026-11-${10 + d}` })));
    expect(stages.size).toBeGreaterThan(1);
  });
});

describe("Genres und Stimmung aus offenen Quellen", () => {
  it("Tags: Unbrauchbares raus, Künstlername raus, höchstens sechs", () => {
    expect(
      cleanTags(
        ["Seen Live", "Indie Rock", "indie rock", "favorites", "Coldplay", "2000s", "female vocalists", "britpop"],
        ["Coldplay"],
      ),
    ).toEqual(["indie rock", "britpop"]);
    expect(cleanTags(["a", "b", "c", "d", "e", "f", "g"])).toHaveLength(6);
    expect(moodFrom(["Relaxed", "dreamy"])).toBe("ruhig");
    expect(moodFrom(["Energetic", "party"])).toBe("energetisch");
    expect(moodFrom(["Happy", "sad"])).toBeUndefined();
  });

  it("TheAudioDB: Genre, Stil („Rock/Pop“ → zwei) und Stimmung; nur bei exaktem Künstlernamen", async () => {
    const http = vi.fn<Http>(async () =>
      json({ artists: [{ strArtist: "Coldplay", strGenre: "Alternative Rock", strStyle: "Rock/Pop", strMood: "Happy" }] }),
    );
    expect(await audioDbTags("coldplay", http, "123")).toEqual({ genres: ["Alternative Rock", "Rock", "Pop"], moods: ["Happy"] });
    expect(http.mock.calls[0]![0]).toContain("/json/123/search.php?s=coldplay");
    expect(await audioDbTags("Coldplay Tribute", http, "123")).toEqual({ genres: [], moods: [] });
    await expect(audioDbTags("x", async () => json({}, 500), "123")).rejects.toThrow(/500/);
    expect(await audioDbTags("x", async () => json({ artists: null }), "123")).toEqual({ genres: [], moods: [] });
  });

  it("Last.fm: Top-Tags zum Titel bzw. Künstler, seltene Tags fallen weg", async () => {
    const http = vi.fn<Http>(async () =>
      json({
        toptags: {
          tag: [
            { name: "pop", count: 100 },
            { name: "dance", count: "40" },
            { name: "zufall", count: 3 },
          ],
        },
      }),
    );
    expect(await lastfmTags({ artist: "A", title: "T" }, http, "KEY")).toEqual(["pop", "dance"]);
    expect(http.mock.calls[0]![0]).toMatch(/method=track\.gettoptags.*track=T/);
    await lastfmTags({ artist: "A" }, http, "KEY");
    expect(http.mock.calls[1]![0]).toContain("method=artist.gettoptags");
    expect(await lastfmTags({ artist: "A" }, async () => json({ toptags: { tag: { name: "solo", count: 1 } } }), "K")).toEqual([
      "solo",
    ]);
    expect(await lastfmTags({ artist: "A" }, async () => json({ error: 6 }), "K")).toEqual([]);
  });

  it("alle Quellen zusammen; ein Ausfall kostet nur die Vollständigkeit", async () => {
    const http = async (url: string) =>
      url.includes("theaudiodb")
        ? json({ artists: [{ strArtist: "Mira Sol", strGenre: "Dance Pop", strStyle: null, strMood: "Energetic" }] })
        : url.includes("track.gettoptags")
          ? json({ toptags: { tag: [{ name: "Synthpop", count: 50 }] } })
          : json({}, 503);
    const r = await collectTags(
      { title: "Neonlicht", artists: ["Mira Sol", "Kai Vento"] },
      { http, audioDbKey: "123", lastfmKey: "K" },
    );
    expect(r).toEqual({ genres: ["synthpop", "dance pop"], mood: "energetisch", complete: false });
    const noKey = await collectTags({ title: "x", artists: ["Mira Sol"] }, { http, audioDbKey: "123" });
    expect(noKey).toMatchObject({ genres: ["dance pop"], complete: true });
    expect(await collectTags({ title: "x", artists: [] }, { http, audioDbKey: "123" })).toEqual({ genres: [], complete: true });
  });
});

describe("KI-Regie", () => {
  const facts = {
    title: "Neonlicht",
    artists: ["Mira Sol"],
    album: "Demo",
    year: 2024,
    durationMs: 200_000,
    tags: ["dance pop"],
    sections: [{ kind: "chorus", seconds: 20 }],
    lyrics: "Wir tanzen",
  };
  const fake = (result: unknown) => {
    const parse = vi.fn<(args: Record<string, unknown>) => Promise<unknown>>(async () => result);
    return { client: { beta: { messages: { parse } } } as unknown as Anthropic, parse };
  };

  it("ein Aufruf mit strukturierter Ausgabe, niedrigem Aufwand und Ausweich-Fallback", async () => {
    const { client, parse } = fake({ stop_reason: "end_turn", parsed_output: brief });
    expect(await createShowDirector({ client })(facts)).toEqual({ brief });
    const args = parse.mock.calls[0]![0] as {
      model: string;
      betas: string[];
      fallbacks: string;
      system: string;
      messages: Array<{ content: string }>;
      output_config: { effort: string; format: unknown };
    };
    expect(args.model).toBe(DEFAULT_SHOW_MODEL);
    expect(args.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(args.fallbacks).toBe("default");
    expect(args.output_config.effort).toBe("low");
    expect(args.output_config.format).toBeDefined();
    expect(args.system).toBe(SHOW_SYSTEM_PROMPT);
    for (const id of Object.keys(THEMES)) expect(SHOW_SYSTEM_PROMPT).toContain(`- ${id}:`);
    expect(args.messages[0]!.content).toBe(describeSong(facts));
    expect(args.messages[0]!.content).toMatch(
      /Titel: Neonlicht[\s\S]*Album: Demo \(2024\)[\s\S]*chorus \(20 s\)[\s\S]*Wir tanzen/,
    );
    expect(describeSong({ ...facts, sections: [], lyrics: undefined, album: undefined })).toMatch(
      /Jahr: 2024[\s\S]*Aufbau: unbekannt[\s\S]*nicht verfügbar/,
    );
    const custom = fake({ stop_reason: "end_turn", parsed_output: brief });
    await createShowDirector({ client: custom.client, model: "claude-haiku-5-5" })(facts);
    expect((custom.parse.mock.calls[0]![0] as { model: string }).model).toBe("claude-haiku-5-5");
  });

  it("Ablehnung, unbrauchbare Antwort und API-Fehler werden unterschieden", async () => {
    expect(await createShowDirector(fake({ stop_reason: "refusal", parsed_output: null }))(facts)).toEqual({
      brief: null,
      reason: "abgelehnt",
    });
    expect(await createShowDirector(fake({ stop_reason: "end_turn", parsed_output: null }))(facts)).toEqual({
      brief: null,
      reason: "ungültig",
    });
    const failing = (status: number) => {
      const parse = vi.fn(async () => {
        throw Anthropic.APIError.generate(status, { type: "error", error: { type: "x", message: "m" } }, "m", new Headers());
      });
      return createShowDirector({ client: { beta: { messages: { parse } } } as unknown as Anthropic })(facts);
    };
    expect(await failing(401)).toEqual({ brief: null, reason: "konfiguration" });
    expect(await failing(400)).toEqual({ brief: null, reason: "konfiguration" });
    expect(await failing(429)).toEqual({ brief: null, reason: "vorübergehend" });
    expect(await failing(529)).toEqual({ brief: null, reason: "vorübergehend" });
    const broken = {
      beta: { messages: { parse: async () => Promise.reject(new TypeError("Programmfehler")) } },
    } as unknown as Anthropic;
    await expect(createShowDirector({ client: broken })(facts)).rejects.toThrow("Programmfehler");
  });
});

describe("Show-Dienst", () => {
  const q = { trackKey: "t1", title: "Neonlicht", artists: ["Mira Sol"], album: "Demo", durationMs: 200_000 };
  const http = () =>
    vi.fn<Http>(async () => json({ artists: [{ strArtist: "Mira Sol", strGenre: "Dance Pop", strStyle: null, strMood: null }] }));

  it("ohne KI: Genres aus den Quellen, gecacht", async () => {
    const h = http();
    const show = createShowService({ cache: memoryCache(), http: h, audioDbKey: "123" });
    expect(await show(q)).toEqual({
      genres: ["dance pop"],
      mood: undefined,
      brief: null,
      source: { tags: "quellen", brief: null },
    });
    await show(q);
    expect(h).toHaveBeenCalledTimes(1);
  });

  it("mit KI: einmal je Song, bekommt Tags, Aufbau und Textauszug aus dem Lyrics-Cache", async () => {
    const cache = memoryCache();
    await cache.set(foundKey("t1"), { lyrics: neonlicht.lyrics }, 60);
    const direct = vi.fn<(facts: SongFacts) => Promise<{ brief: ShowBrief }>>(async () => ({ brief }));
    const show = createShowService({ cache, http: http(), audioDbKey: "123", direct });
    const r = await show(q);
    expect(r.brief).toEqual(brief);
    expect(r.source.brief).toBe(DEFAULT_SHOW_MODEL);
    expect(r.genres).toEqual(["dance pop"]); // Quellen gehen vor
    expect(r.mood).toBe("ruhig"); // Stimmung ergänzt die Regie
    const facts = direct.mock.calls[0]![0];
    expect(facts.tags).toEqual(["dance pop"]);
    expect(facts.sections.map((s) => s.kind)).toContain("chorus");
    expect(facts.lyrics).toContain("Wir tanzen unterm Neonlicht");
    await show(q);
    expect(direct).toHaveBeenCalledTimes(1);
  });

  it("Ablehnung wird gemerkt, Störung nicht; ohne Quellen-Genres liefert die Regie sie", async () => {
    const refused = vi.fn(async () => ({ brief: null, reason: "abgelehnt" as const }));
    const a = createShowService({ cache: memoryCache(), http: http(), audioDbKey: "123", direct: refused });
    await a(q);
    await a(q);
    expect(refused).toHaveBeenCalledTimes(1);
    let fail = true;
    const flaky = vi.fn(async () => (fail ? { brief: null, reason: "vorübergehend" as const } : { brief }));
    const b = createShowService({
      cache: memoryCache(),
      http: async () => json({ artists: null }),
      audioDbKey: "123",
      direct: flaky,
      model: "claude-haiku-5-5",
    });
    expect((await b(q)).brief).toBeNull();
    fail = false;
    const ok = await b(q);
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(ok.genres).toEqual(brief.genres);
    expect(ok.source).toEqual({ tags: "keine", brief: "claude-haiku-5-5" });
  });

  it("Textauszug: ohne Wiederholungen und begrenzt", () => {
    const excerpt = lyricsExcerpt(neonlicht.lyrics)!;
    const lines = excerpt.split("\n");
    expect(new Set(lines).size).toBe(lines.length);
    expect(excerpt.length).toBeLessThanOrEqual(2400);
    expect(lyricsExcerpt(null)).toBeUndefined();
    const long = {
      ...neonlicht.lyrics!,
      lines: Array.from({ length: 400 }, (_, i) => ({
        ...neonlicht.lyrics!.lines[0]!,
        text: `Zeile Nummer ${i} mit etwas Text`,
      })),
    };
    expect(lyricsExcerpt(long)!.length).toBeLessThanOrEqual(2400);
  });
});

describe("Regie im Dashboard", () => {
  const live = {
    ...neonlicht,
    music: { genres: [] as string[] },
    status: { ...neonlicht.status, show: { state: "idle" as const } },
  };
  const payload: ShowPayload = {
    genres: ["dance pop"],
    mood: "energetisch",
    brief,
    source: { tags: "quellen", brief: "claude-opus-5-5" },
  };

  it("Anfrage enthält Titel, Künstler, Album, Dauer und Jahr", () => {
    const u = new URL(showUrl(neonlicht), "http://x");
    expect(u.pathname).toBe("/api/show");
    expect(u.searchParams.get("track")).toBe(neonlicht.trackKey);
    expect(u.searchParams.get("artists")!.split("\u001f")).toEqual(neonlicht.artists.map((a) => a.name));
    expect(Number(u.searchParams.get("durationMs"))).toBe(neonlicht.track.durationMs);
  });

  it("zu Songbeginn: Genres, Stimmung und Brief übernehmen; später nichts mehr umstellen", () => {
    const early = showPatch(live, payload, true);
    expect(early.music).toEqual({ genres: ["dance pop"], mood: "energetisch" });
    expect(early.show).toEqual(brief);
    expect(early.status!.show).toMatchObject({ state: "ok", provider: "claude-opus-5-5" });
    const late = showPatch(live, payload, false);
    expect(late.show).toBeUndefined();
    expect(late.music).toBeUndefined();
    // vorhandene Genres (Demo) bleiben
    expect(showPatch(neonlicht, payload, true).music!.genres).toEqual(neonlicht.music.genres);
    expect(
      showPatch(live, { ...payload, brief: null, genres: [], source: { tags: "keine", brief: null } }, true).status,
    ).toMatchObject({
      show: { state: "missing", provider: "regeln" },
      music: { state: "missing" },
    });
  });
});
