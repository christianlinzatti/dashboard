import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seal } from "@/lib/server/crypto";
import { FETCH_BEFORE_END_MS, shouldFetchUpNext, upNextVisible } from "@/lib/show/up-next";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));

describe("„Gleich kommt …“: Zeitpunkte", () => {
  it("holt 45 s vor Songende, zeigt in den letzten 15 s (nicht in der letzten Sekunde, nicht bei kurzen Songs)", () => {
    const d = 200_000;
    expect(shouldFetchUpNext(d, d - FETCH_BEFORE_END_MS - 1)).toBe(false);
    expect(shouldFetchUpNext(d, d - FETCH_BEFORE_END_MS)).toBe(true);
    expect(shouldFetchUpNext(0, 0)).toBe(false);
    expect(upNextVisible(d, d - 16_000)).toBe(false);
    expect(upNextVisible(d, d - 10_000)).toBe(true);
    expect(upNextVisible(d, d - 500)).toBe(false);
    expect(upNextVisible(50_000, 45_000)).toBe(false);
  });
});

const track = (over: Record<string, unknown> = {}) => ({
  id: "abc",
  type: "track",
  name: "Nächster Song",
  duration_ms: 180_000,
  artists: [{ id: "a1", name: "Band" }],
  album: { name: "Album", images: [{ url: "https://i.scdn.co/x.jpg", width: 300, height: 300 }] },
  ...over,
});

describe("/api/up-next", () => {
  beforeEach(() => {
    jar.clear();
    vi.stubEnv("SESSION_SECRET", "s".repeat(40));
    vi.stubEnv("SPOTIFY_CLIENT_ID", "c");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "g");
    jar.set(
      "ss_session",
      seal(
        { uid: "u", name: "n", accessToken: "a", expiresAt: Date.now() + 3_600_000, refreshToken: "r", scope: "" },
        "s".repeat(40),
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const call = async (spotify: () => Response) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => spotify()),
    );
    const { GET } = await import("@/app/api/up-next/route");
    const res = await GET();
    return { status: res.status, body: (await res.json()) as { track: { name: string } | null } };
  };

  it("liefert den ersten Titel der Warteschlange", async () => {
    const r = await call(() => Response.json({ currently_playing: track(), queue: [track(), track({ name: "danach" })] }));
    expect(r.body.track?.name).toBe("Nächster Song");
  });

  it("leere Warteschlange, Podcast-Folge oder lokale Datei: kein Titel; Spotify-Fehler: 502", async () => {
    expect((await call(() => Response.json({ queue: [] }))).body.track).toBeNull();
    expect((await call(() => new Response(null, { status: 204 }))).body.track).toBeNull();
    expect((await call(() => Response.json({ queue: [{ type: "episode", name: "Podcast" }] }))).body.track).toBeNull();
    expect((await call(() => Response.json({ queue: [track({ is_local: true })] }))).body.track).toBeNull();
    expect((await call(() => new Response("kaputt", { status: 500 }))).status).toBe(502);
  });

  it("ohne Anmeldung: 401", async () => {
    jar.clear();
    expect((await call(() => Response.json({ queue: [track()] }))).status).toBe(401);
  });
});
