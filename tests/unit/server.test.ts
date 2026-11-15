import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshSession, spotifyFetch, SpotifyError } from "@/lib/spotify/api";
import { seal } from "@/lib/server/crypto";
import type { Session } from "@/lib/server/session";
import { cacheKey, createLyricsService, foundKey } from "@/lib/lyrics/service";
import { toLyrics } from "@/lib/lyrics/chain";
import { createBreaker } from "@/lib/lyrics/breaker";
import { memoryCache } from "@/lib/lyrics/cache";
import type { LyricsProvider, ProviderResult, TrackQuery } from "@/lib/lyrics/types";

// --- next/headers (Cookies) für die Routen-Hilfen nachbilden ---
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));

const SECRET = "s".repeat(40);
const session = (over: Partial<Session> = {}): Session => ({
  uid: "u",
  name: "Test",
  accessToken: "alt",
  expiresAt: Date.now() + 3_600_000,
  refreshToken: "rt-1",
  scope: "",
  ...over,
});

describe("Spotify-Token-Erneuerung", () => {
  it("Single-Flight: gleichzeitige Erneuerungen laufen nur einmal", async () => {
    const refresh = vi.fn(async (s: Session) => {
      await new Promise((r) => setTimeout(r, 20));
      return { ...s, accessToken: "neu", refreshToken: "rt-2" };
    });
    const s = session({ refreshToken: "rt-single" });
    const [a, b] = await Promise.all([refreshSession(s, refresh), refreshSession(s, refresh)]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(a.accessToken).toBe("neu");
    expect(b.refreshToken).toBe("rt-2");
    // auch eine spätere Anfrage mit noch altem Cookie bekommt das Ergebnis
    expect((await refreshSession(s, refresh)).accessToken).toBe("neu");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("fehlgeschlagene Erneuerung wird nicht wiederverwendet", async () => {
    const s = session({ refreshToken: "rt-fail" });
    const failing = vi.fn(async () => {
      throw new SpotifyError(400, "invalid_grant");
    });
    await expect(refreshSession(s, failing)).rejects.toThrow("invalid_grant");
    const ok = vi.fn(async (x: Session) => ({ ...x, accessToken: "ok" }));
    expect((await refreshSession(s, ok)).accessToken).toBe("ok");
  });

  it("spotifyFetch erneuert abgelaufene Tokens vorab und wiederholt bei 401 genau einmal", async () => {
    const refresh = vi.fn(async (s: Session) => ({
      ...s,
      accessToken: `neu-${s.refreshToken}`,
      expiresAt: Date.now() + 3_600_000,
    }));
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("{}", { status: 200 }));
    const r1 = await spotifyFetch(session({ expiresAt: 0, refreshToken: "rt-exp" }), "/me", {}, { fetch: fetchMock, refresh });
    expect(r1.refreshed).toBe(true);
    expect((fetchMock.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBe("Bearer neu-rt-exp");

    const f401 = vi.fn<typeof fetch>(
      async (_u, init) =>
        new Response("{}", { status: (init!.headers as Record<string, string>).Authorization === "Bearer alt" ? 401 : 200 }),
    );
    const r2 = await spotifyFetch(session({ refreshToken: "rt-401" }), "/me", {}, { fetch: f401, refresh });
    expect(f401).toHaveBeenCalledTimes(2);
    expect(r2.res.status).toBe(200);
    expect(r2.session.accessToken).toBe("neu-rt-401");
  });
});

describe("Routen-Rahmen withSpotify", () => {
  beforeEach(() => {
    jar.clear();
    vi.stubEnv("SPOTIFY_CLIENT_ID", "id");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret");
    vi.stubEnv("SESSION_SECRET", SECRET);
  });

  it("503 ohne Konfiguration, 401 ohne Anmeldung", async () => {
    const { withSpotify } = await import("@/lib/server/spotify-route");
    expect((await withSpotify(async () => new Response("x"))).status).toBe(401);
    vi.stubEnv("SESSION_SECRET", "kurz");
    expect((await withSpotify(async () => new Response("x"))).status).toBe(503);
  });

  it("mit Anmeldung: Handler läuft; abgelehnte Erneuerung → 401 statt 500", async () => {
    const { withSpotify } = await import("@/lib/server/spotify-route");
    jar.set("ss_session", seal(session(), SECRET));
    const ok = await withSpotify(async (_call, s) => Response.json({ name: s.name }));
    expect(await ok.json()).toEqual({ name: "Test" });

    const expired = await withSpotify(async () => {
      throw new SpotifyError(400, "invalid_grant");
    });
    expect(expired.status).toBe(401);
    const broken = await withSpotify(async () => {
      throw new Error("Netz weg");
    });
    expect(broken.status).toBe(502);
  });
});

describe("Lyrics-Service", () => {
  const q: TrackQuery = { trackKey: "t1", spotifyId: "abc", title: "Lied", artists: ["Band"], durationMs: 180_000 };
  const result = (provider: string): ProviderResult => ({
    provider,
    sync: "line",
    lines: [{ startMs: 1000, endMs: 3000, text: "Hallo Welt" }],
  });
  const provider = (id: string, impl: () => Promise<ProviderResult | null>): LyricsProvider => ({
    id,
    priority: 10,
    search: vi.fn(impl),
  });
  const noLocal = provider("lokal", async () => null);
  const deps = (providers: LyricsProvider[], local = noLocal) => ({
    providers,
    cache: memoryCache(),
    local,
    breaker: createBreaker(),
    spDcConfigured: false,
  });

  it("eigene Korrekturen gewinnen ohne Provider-Abfrage", async () => {
    const ext = provider("ext", async () => result("ext"));
    const svc = createLyricsService(
      deps(
        [ext],
        provider("lokal", async () => result("lokal")),
      ),
    );
    expect((await svc(q)).lyrics?.provider).toBe("lokal");
    expect(ext.search).not.toHaveBeenCalled();
  });

  it("Treffer werden gecacht", async () => {
    const ext = provider("ext", async () => result("ext"));
    const svc = createLyricsService(deps([ext]));
    expect((await svc(q)).cached).toBe(false);
    expect((await svc(q)).cached).toBe(true);
    expect(ext.search).toHaveBeenCalledTimes(1);
  });

  it("vorübergehende Fehler werden nicht gecacht, echtes „nicht gefunden“ schon", async () => {
    let fail = true;
    const flaky = provider("flaky", async () => {
      if (fail) throw new Error("503");
      return result("flaky");
    });
    const svc = createLyricsService(deps([flaky]));
    expect((await svc(q)).lyrics).toBeNull();
    fail = false;
    expect((await svc(q)).lyrics?.provider).toBe("flaky");

    const none = provider("none", async () => null);
    const svc2 = createLyricsService(deps([none]));
    await svc2(q);
    expect((await svc2(q)).cached).toBe(true);
  });

  describe("Cache bei geänderter Provider-Liste", () => {
    const wordResult = (p: string): ProviderResult => ({
      provider: p,
      sync: "word",
      lines: [{ startMs: 1000, endMs: 3000, text: "Hallo Welt", words: [{ startMs: 1000, endMs: 3000, text: "Hallo" }] }],
    });

    it("Wort-Sync-Treffer bleiben, auch wenn ein Provider dazukommt", async () => {
      const cache = memoryCache();
      const a = provider("a", async () => wordResult("a"));
      await createLyricsService({ ...deps([a]), cache })(q);
      const b = provider("b", async () => wordResult("b"));
      const r = await createLyricsService({ ...deps([b, a]), cache })(q);
      expect(r).toMatchObject({ cached: true, lyrics: { provider: "a" } });
      expect(b.search).not.toHaveBeenCalled();
    });

    it("Zeilen-Sync wird nach Provider-Änderung einmal neu geprüft und nur durch Besseres ersetzt", async () => {
      const cache = memoryCache();
      const line = provider("line", async () => result("line"));
      await createLyricsService({ ...deps([line]), cache })(q);
      // neuer Provider findet nichts → alter Treffer bleibt, danach keine weitere Suche
      const none = provider("none", async () => null);
      const svc = createLyricsService({ ...deps([none, line]), cache });
      expect((await svc(q)).lyrics?.provider).toBe("line");
      expect((await svc(q)).cached).toBe(true);
      expect(none.search).toHaveBeenCalledTimes(1);
      // neuer Provider mit Wort-Sync → ersetzt den Treffer
      const word = provider("word", async () => wordResult("word"));
      const r = await createLyricsService({ ...deps([word, line]), cache })(q);
      expect(r).toMatchObject({ cached: false, lyrics: { provider: "word", quality: "word" } });
    });

    it("„nicht gefunden“ gilt nur für dieselbe Provider-Liste", async () => {
      const cache = memoryCache();
      const none = provider("none", async () => null);
      await createLyricsService({ ...deps([none]), cache })(q);
      expect((await createLyricsService({ ...deps([none]), cache })(q)).cached).toBe(true);
      const found = provider("neu", async () => result("neu"));
      expect((await createLyricsService({ ...deps([found, none]), cache })(q)).lyrics?.provider).toBe("neu");
    });

    it("Einträge im alten Schlüsselformat werden übernommen", async () => {
      const cache = memoryCache();
      const a = provider("a", async () => result("a"));
      const legacyValue = { lyrics: toLyrics(result("alt"), q), instrumental: false, attempts: [] };
      await cache.set(cacheKey(q.trackKey, [a], false), legacyValue, 60);
      const svc = createLyricsService({ ...deps([a]), cache });
      expect(await svc(q)).toMatchObject({ cached: true, lyrics: { provider: "alt" } });
      expect(a.search).not.toHaveBeenCalled();
      expect(await cache.get(foundKey(q.trackKey))).toMatchObject({ lyrics: { provider: "alt" } });
    });
  });

  it("Cache-Schlüssel ändert sich mit der Provider-Konfiguration", () => {
    const a = [provider("lrclib", async () => null)];
    const b = [...a, provider("netease", async () => null)];
    expect(cacheKey("t", a, false)).not.toBe(cacheKey("t", b, false));
    expect(cacheKey("t", a, false)).not.toBe(cacheKey("t", a, true));
    expect(cacheKey("t", a, false)).toBe(cacheKey("t", a, false));
  });
});

describe("Geräte-Einstellungen", () => {
  it("speichert und lädt Qualität/Strobe; ungültige Werte fallen auf Standard zurück", async () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    const { settings } = await import("@/lib/settings");
    settings.getState().set({ quality: "hoch", strobe: false });
    expect(JSON.parse(store.get("ss_settings")!)).toEqual({
      quality: "hoch",
      strobe: false,
      lamps: true,
      secondLine: "auto",
      stage: "auto",
    });
    settings.getState().set({ secondLine: "uebersetzung", stage: "jazz" });
    settings.getState().hydrate();
    expect(settings.getState()).toMatchObject({ secondLine: "uebersetzung", stage: "jazz" });
    store.set("ss_settings", JSON.stringify({ quality: "ultra", strobe: "ja", secondLine: "klingonisch", stage: "disco" }));
    settings.getState().hydrate();
    expect(settings.getState()).toMatchObject({ quality: "auto", strobe: true, secondLine: "auto", stage: "auto" });
    vi.unstubAllGlobals();
  });
});

describe("Lyrics-Neuversuche im Browser", () => {
  it("nur vorübergehende Fehler lösen Neuversuche aus", async () => {
    const { isTransientMiss, RETRY_DELAYS_MS } = await import("@/components/lyrics/useLyricsLoader");
    expect(RETRY_DELAYS_MS).toEqual([10_000, 30_000, 90_000]);
    expect(isTransientMiss({ lyrics: null, instrumental: false, attempts: [{ provider: "a", outcome: "timeout", ms: 1 }] })).toBe(
      true,
    );
    expect(isTransientMiss({ lyrics: null, instrumental: false, attempts: [{ provider: "a", outcome: "empty", ms: 1 }] })).toBe(
      false,
    );
    expect(isTransientMiss({ lyrics: null, instrumental: true, attempts: [{ provider: "a", outcome: "error", ms: 1 }] })).toBe(
      false,
    );
  });
});
