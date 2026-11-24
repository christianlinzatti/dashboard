import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { seal } from "@/lib/server/crypto";
import type { OAuthState, Session } from "@/lib/server/session";

// --- next/headers nachbilden: Cookies samt Optionen merken ---
type Cookie = { value: string; options?: Record<string, unknown> };
const jar = new Map<string, Cookie>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n)!.value } : undefined),
    set: (n: string, value: string, options?: Record<string, unknown>) => void jar.set(n, { value, options }),
    delete: (n: string) => void jar.delete(n),
  }),
}));

const SECRET = "x".repeat(40);
const session: Session = {
  uid: "nutzer-1",
  name: "Test",
  accessToken: "at",
  expiresAt: Date.now() + 3_600_000,
  refreshToken: "rt",
  scope: "user-read-currently-playing",
};

beforeEach(() => {
  jar.clear();
  vi.stubEnv("SESSION_SECRET", SECRET);
  vi.stubEnv("SPOTIFY_CLIENT_ID", "client");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "geheim");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Sitzung (verschlüsseltes Cookie)", () => {
  it("schreiben und lesen; Cookie nur für den Server (httpOnly, SameSite=Lax, ein Jahr)", async () => {
    const { readSession, writeSession, SESSION_COOKIE } = await import("@/lib/server/session");
    await writeSession(session);
    const c = jar.get(SESSION_COOKIE)!;
    expect(c.value).not.toContain("at"); // Token steht nicht im Klartext im Cookie
    expect(c.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    expect(await readSession()).toEqual(session);
  });

  it("in Produktion nur über HTTPS (secure)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { writeSession, SESSION_COOKIE } = await import("@/lib/server/session");
    await writeSession(session);
    expect(jar.get(SESSION_COOKIE)!.options).toMatchObject({ secure: true });
  });

  it("manipuliertes, fremd verschlüsseltes, kaputtes oder fehlendes Cookie: nicht angemeldet", async () => {
    const { readSession, writeSession, SESSION_COOKIE } = await import("@/lib/server/session");
    expect(await readSession()).toBeNull();

    await writeSession(session);
    const [iv, tag, body] = jar.get(SESSION_COOKIE)!.value.split(".");
    // ein Zeichen im verschlüsselten Inhalt ändern → Prüfsumme (GCM) schlägt an
    const flipped = body!.slice(0, -2) + (body!.at(-2) === "A" ? "B" : "A") + body!.at(-1);
    jar.set(SESSION_COOKIE, { value: [iv, tag, flipped].join(".") });
    expect(await readSession()).toBeNull();

    // mit einem anderen Schlüssel versiegelt (z. B. nach Wechsel von SESSION_SECRET)
    jar.set(SESSION_COOKIE, { value: seal({ ...session, uid: "angreifer" }, "y".repeat(40)) });
    expect(await readSession()).toBeNull();

    for (const value of ["", "abc", "a.b", "...", "%%%.%%%.%%%"]) {
      jar.set(SESSION_COOKIE, { value });
      expect(await readSession(), value).toBeNull();
    }
  });

  it("zu kurzes Geheimnis: es wird kein (schwach geschütztes) Cookie geschrieben, Lesen ergibt keine Sitzung", async () => {
    const { readSession, writeSession, SESSION_COOKIE } = await import("@/lib/server/session");
    await writeSession(session);
    vi.stubEnv("SESSION_SECRET", "zu-kurz");
    await expect(writeSession(session)).rejects.toThrow(/SESSION_SECRET/);
    expect(await readSession()).toBeNull();
    expect(jar.has(SESSION_COOKIE)).toBe(true); // das alte Cookie bleibt unangetastet
  });

  it("abmelden löscht das Cookie", async () => {
    const { clearSession, readSession, writeSession } = await import("@/lib/server/session");
    await writeSession(session);
    await clearSession();
    expect(await readSession()).toBeNull();
  });

  it("Anmelde-Zustand (OAuth): zehn Minuten gültig und nur einmal verwendbar", async () => {
    const { takeOAuthState, writeOAuthState, OAUTH_COOKIE } = await import("@/lib/server/session");
    const s: OAuthState = { state: "st", verifier: "v", redirectUri: "https://x/cb", createdAt: Date.now() };
    await writeOAuthState(s);
    expect(jar.get(OAUTH_COOKIE)!.options).toMatchObject({ httpOnly: true, maxAge: 600 });
    expect(await takeOAuthState()).toEqual(s);
    expect(await takeOAuthState()).toBeNull();
  });
});

describe("Anmeldung: Rückkehr von Spotify (/api/auth/callback)", () => {
  const saved = (over: Partial<OAuthState> = {}): OAuthState => ({
    state: "richtig",
    verifier: "v",
    redirectUri: "https://dash.example/api/auth/callback",
    createdAt: Date.now(),
    ...over,
  });
  const call = async (query: string) => {
    const { GET } = await import("@/app/api/auth/callback/route");
    const res = await GET(new NextRequest(`https://dash.example/api/auth/callback?${query}`));
    return { status: res.status, location: res.headers.get("location") ?? "" };
  };
  /** Spotify nachbilden: Token-Tausch und Profil */
  const spotify = (profileId = "nutzer-1") => {
    const f = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/api/token"))
        return Response.json({ access_token: "neu", expires_in: 3600, refresh_token: "rt-neu", scope: "s" });
      if (u.endsWith("/v1/me")) return Response.json({ id: profileId, display_name: "Chris" });
      return new Response("unerwartet", { status: 500 });
    });
    vi.stubGlobal("fetch", f);
    return f;
  };

  it("gültiger Rücksprung: Sitzung angelegt, zurück zum Dashboard", async () => {
    const { writeOAuthState, readSession } = await import("@/lib/server/session");
    spotify();
    await writeOAuthState(saved());
    const r = await call("code=c&state=richtig");
    expect(r.location).toBe("https://dash.example/");
    expect(await readSession()).toMatchObject({ uid: "nutzer-1", name: "Chris", accessToken: "neu", refreshToken: "rt-neu" });
  });

  it("falscher, fehlender oder abgelaufener Zustand: abgewiesen, ohne Spotify zu fragen", async () => {
    const { writeOAuthState, readSession } = await import("@/lib/server/session");
    const f = spotify();
    await writeOAuthState(saved());
    expect((await call("code=c&state=gefaelscht")).location).toContain("fehler=ungueltig");
    // der Zustand ist nach einem Versuch verbraucht – auch der richtige Wert hilft danach nicht mehr
    expect((await call("code=c&state=richtig")).location).toContain("fehler=ungueltig");
    await writeOAuthState(saved({ createdAt: Date.now() - 11 * 60_000 }));
    expect((await call("code=c&state=richtig")).location).toContain("fehler=ungueltig");
    await writeOAuthState(saved());
    expect((await call("state=richtig")).location).toContain("fehler=ungueltig");
    expect(f).not.toHaveBeenCalled();
    expect(await readSession()).toBeNull();
  });

  it("abgebrochen bei Spotify; Konto nicht freigegeben; Profil oder Token-Tausch scheitert: keine Sitzung", async () => {
    const { writeOAuthState, readSession } = await import("@/lib/server/session");
    await writeOAuthState(saved());
    expect((await call("error=access_denied&state=richtig")).location).toContain("fehler=abgebrochen");

    vi.stubEnv("ALLOWED_SPOTIFY_USERS", "chef, gast");
    spotify("fremder");
    await writeOAuthState(saved());
    expect((await call("code=c&state=richtig")).location).toContain("fehler=nicht-freigegeben");
    vi.stubEnv("ALLOWED_SPOTIFY_USERS", "");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) =>
        String(url).includes("/api/token")
          ? Response.json({ access_token: "neu", expires_in: 3600, scope: "s" })
          : new Response("weg", { status: 503 }),
      ),
    );
    await writeOAuthState(saved());
    expect((await call("code=c&state=richtig")).location).toContain("fehler=profil");

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 })),
    );
    await writeOAuthState(saved());
    expect((await call("code=c&state=richtig")).location).toContain("fehler=token");
    expect(await readSession()).toBeNull();
  });
});
