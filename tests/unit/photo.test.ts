import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seal } from "@/lib/server/crypto";
import { photoStore as flow } from "@/lib/photo/store";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined),
    set: (n: string, v: string) => void jar.set(n, v),
    delete: (n: string) => void jar.delete(n),
  }),
}));

const SECRET = "s".repeat(40);
const login = (uid = "u") =>
  jar.set(
    "ss_session",
    seal({ uid, name: "n", accessToken: "a", expiresAt: Date.now() + 3_600_000, refreshToken: "r", scope: "" }, SECRET),
  );
const jpeg = (n = 2000) => {
  const b = new Uint8Array(n);
  b.set([0xff, 0xd8, 0xff, 0xe0]);
  return b;
};

describe("Erinnerungsfoto: Ablauf", () => {
  it("Auslöser → Aufnahme → Hochladen → fertig; zweiter Auslöser während der Aufnahme zählt nicht", () => {
    flow.getState().clear();
    flow.getState().request();
    expect(flow.getState().phase).toBe("aufnahme");
    flow.getState().captured("data:raw");
    flow.getState().request(); // läuft schon
    expect(flow.getState()).toMatchObject({ phase: "hochladen", raw: "data:raw" });
    flow.getState().done("data:fertig", "abc");
    expect(flow.getState()).toMatchObject({ phase: "fertig", raw: null, image: "data:fertig", id: "abc" });
    flow.getState().request(); // nach dem Foto: neues Foto möglich
    expect(flow.getState()).toMatchObject({ phase: "aufnahme", image: null, id: null });
    flow.getState().failed("kaputt");
    expect(flow.getState()).toMatchObject({ phase: "fehler", error: "kaputt" });
    flow.getState().clear();
    expect(flow.getState().phase).toBe("aus");
  });
});

describe("Erinnerungsfoto: Server", () => {
  beforeEach(() => {
    jar.clear();
    vi.resetModules();
    vi.stubEnv("SESSION_SECRET", SECRET);
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("KV_REST_API_URL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });
  const post = async (body: Uint8Array, type = "image/jpeg") => {
    const { POST } = await import("@/app/api/photo/route");
    const res = await POST(
      new Request("http://x/api/photo", { method: "POST", headers: { "content-type": type }, body: body as BodyInit }),
    );
    return { status: res.status, body: (await res.json()) as { id?: string; error?: string } };
  };
  const get = async (id: string) => {
    const { GET } = await import("@/app/api/photo/[id]/route");
    return GET(new Request(`http://x/api/photo/${id}`), { params: Promise.resolve({ id }) });
  };

  it("hochladen (angemeldet) und unter nicht erratbarer Adresse abrufen (ohne Anmeldung)", async () => {
    login();
    const up = await post(jpeg());
    expect(up.status).toBe(200);
    expect(up.body.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    jar.clear(); // das Handy des Gasts ist nicht angemeldet
    const res = await get(up.body.id!);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await res.arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect((await get("A".repeat(22))).status).toBe(404);
    expect((await get("../../etc/passwd")).status).toBe(404);
  });

  it("abgewiesen: ohne Anmeldung, kein JPEG, zu groß, zu schnell hintereinander", async () => {
    expect((await post(jpeg())).status).toBe(401);
    login("u2");
    expect((await post(jpeg(), "image/png")).status).toBe(415);
    expect((await post(new Uint8Array(2000).fill(1))).status).toBe(400);
    expect((await post(jpeg(800_000))).status).toBe(413);
    // angekündigte Größe zu groß: abgewiesen, ohne den Inhalt zu lesen
    const { POST } = await import("@/app/api/photo/route");
    const big = new Request("http://x/api/photo", {
      method: "POST",
      headers: { "content-type": "image/jpeg", "content-length": "5000000" },
      body: jpeg() as BodyInit,
    });
    expect((await POST(big)).status).toBe(413);
    expect((await post(jpeg())).status).toBe(200);
    expect((await post(jpeg())).status).toBe(429);
  });

  it("Galerie des Abends: anlegen (angemeldet), abrufen, nur gültige Adressen", async () => {
    const gallery = async (body: unknown) => {
      const { POST } = await import("@/app/api/photo/galerie/route");
      const res = await POST(
        new Request("http://x/api/photo/galerie", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      return { status: res.status, body: (await res.json()) as { id?: string } };
    };
    expect((await gallery({ ids: ["A".repeat(22)] })).status).toBe(401);
    login("u3");
    expect((await gallery({ ids: [] })).status).toBe(400);
    expect((await gallery({ ids: ["../x"] })).status).toBe(400);
    expect((await gallery({ ids: Array.from({ length: 31 }, (_, i) => String(i).padStart(22, "A")) })).status).toBe(400);
    const ok = await gallery({ ids: ["A".repeat(22), "B".repeat(22), "A".repeat(22)] });
    expect(ok.status).toBe(200);
    const { photoStore: store } = await import("@/lib/server/photo-store");
    expect(await store().getGallery(ok.body.id!)).toEqual(["A".repeat(22), "B".repeat(22)]);
    expect(await store().getGallery("C".repeat(22))).toBeNull();
    expect(await store().getGallery("../etc")).toBeNull();
  });
});

describe("Fotos des Abends (im Browser)", () => {
  it("nur noch abrufbare Fotos des laufenden Abends", async () => {
    const { currentEvening } = await import("@/lib/photo/evening");
    const h = 3600_000;
    const now = 100 * h;
    const list = [
      { id: "alt", at: now - 30 * h }, // abgelaufen
      { id: "gestern", at: now - 20 * h }, // anderer Abend (lange Pause danach)
      { id: "a", at: now - 3 * h },
      { id: "b", at: now - 1 * h },
    ];
    expect(currentEvening(list, now).map((p) => p.id)).toEqual(["a", "b"]);
    expect(currentEvening([], now)).toEqual([]);
  });
});
