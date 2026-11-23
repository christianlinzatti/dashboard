import { describe, expect, it, vi } from "vitest";
import { createCanvas, decodeCanvasResponse, encodeCanvasRequest } from "@/lib/spotify/canvas";

const signal = () => new AbortController().signal;

/** Protobuf von Hand bauen (zum Prüfen des Decoders) */
function varint(v: number) {
  const o: number[] = [];
  while (v > 0x7f) {
    o.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  o.push(v);
  return o;
}
function field(f: number, bytes: number[]) {
  return [...varint((f << 3) | 2), ...varint(bytes.length), ...bytes];
}
function canvazResponse(items: Array<{ url: string; type: number; uri: string }>) {
  const out: number[] = [];
  for (const it of items) {
    const c = [...field(2, [...Buffer.from(it.url)]), ...varint((4 << 3) | 0), it.type, ...field(5, [...Buffer.from(it.uri)])];
    out.push(...field(1, c));
  }
  return Uint8Array.from(out);
}
const protobuf = (body: Uint8Array, status = 200) =>
  new Response(body as BodyInit, { status, headers: { "content-type": "application/x-protobuf" } });

describe("Spotify Canvas – Protobuf", () => {
  it("Anfrage kodiert die Track-URI (EntityCanvazRequest)", () => {
    const hex = Buffer.from(encodeCanvasRequest(["spotify:track:abc"])).toString("hex");
    // field1{ field1: "spotify:track:abc" }
    expect(hex).toBe("0a130a1173706f746966793a747261636b3a616263");
  });

  it("Antwort: Video bevorzugt, unbekannte Felder übersprungen", () => {
    const buf = canvazResponse([
      { url: "https://x/img.jpg", type: 0, uri: "spotify:track:a" },
      { url: "https://x/v.mp4", type: 2, uri: "spotify:track:a" },
    ]);
    const canvases = decodeCanvasResponse(buf);
    expect(canvases).toEqual([
      { url: "https://x/img.jpg", kind: "image", entityUri: "spotify:track:a" },
      { url: "https://x/v.mp4", kind: "video", entityUri: "spotify:track:a" },
    ]);
    expect(decodeCanvasResponse(new Uint8Array())).toEqual([]);
  });
});

const cfg = { spDc: "x", totpSecret: "k", now: () => 1_000_000 };
function tokenFetch(onCanvas: (init?: RequestInit) => Response) {
  return vi.fn<typeof fetch>(async (url, init) => {
    const u = String(url);
    if (u.endsWith("/server-time")) return Response.json({ serverTime: 1 });
    if (u.includes("/api/token"))
      return Response.json({ accessToken: "wp", accessTokenExpirationTimestampMs: Date.now() + 3_600_000 });
    return onCanvas(init);
  });
}

describe("Spotify Canvas – Abruf", () => {
  it("liefert das Video-Canvas und merkt es (zweiter Aufruf ohne Netz)", async () => {
    const f = tokenFetch(() => protobuf(canvazResponse([{ url: "https://x/v.mp4", type: 2, uri: "spotify:track:a" }])));
    const c = createCanvas(cfg, f);
    expect(await c.get("4uLU6hMCjMI75M1A2tKUQC", signal())).toEqual({
      url: "https://x/v.mp4",
      kind: "video",
      entityUri: "spotify:track:a",
    });
    const before = f.mock.calls.length;
    await c.get("4uLU6hMCjMI75M1A2tKUQC", signal());
    expect(f.mock.calls.length).toBe(before); // aus dem Kurzzeitspeicher
    // POST mit Protobuf-Body
    const canvasCall = f.mock.calls.find(([u]) => String(u).includes("canvaz-cache"))!;
    expect(canvasCall[1]?.method).toBe("POST");
  });

  it("kein Canvas: null; Ablehnung pausiert und meldet Grund", async () => {
    const empty = createCanvas(
      cfg,
      tokenFetch(() => protobuf(new Uint8Array())),
    );
    expect(await empty.get("4uLU6hMCjMI75M1A2tKUQC", signal())).toBeNull();

    const reasons: string[] = [];
    const denied = createCanvas(
      { ...cfg, onCircuitOpen: (r) => reasons.push(r) },
      tokenFetch(() => protobuf(new Uint8Array(), 403)),
    );
    expect(await denied.get("4uLU6hMCjMI75M1A2tKUQC", signal())).toBeNull();
    expect(denied.status().paused).toBe(true);
    expect(reasons[0]).toMatch(/Canvas verweigert/);
  });

  it("ohne Konfiguration: null, nichts abgefragt", async () => {
    const f = vi.fn<typeof fetch>(async () => protobuf(new Uint8Array()));
    const c = createCanvas({ now: () => 0 }, f);
    expect(await c.get("4uLU6hMCjMI75M1A2tKUQC", signal())).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(c.status()).toMatchObject({ id: "spotify-canvas", configured: false, paused: false });
  });

  it("abgelaufenes Token: einmal frisch nachfragen; Drosselung pausiert; 404 null; Serverfehler wird gemeldet", async () => {
    // 1. Aufruf füllt den Token-Cache, 2. Aufruf bekommt 401 → frisches Token → Erfolg
    let canvasCalls = 0;
    const retry = createCanvas(
      cfg,
      tokenFetch(() =>
        ++canvasCalls === 2
          ? protobuf(new Uint8Array(), 401)
          : protobuf(canvazResponse([{ url: "https://x/i.jpg", type: 0, uri: "spotify:track:b" }])),
      ),
    );
    await retry.get("4uLU6hMCjMI75M1A2tKUQC", signal());
    expect(await retry.get("0VjIjW4GlUZAMYd2vXMi3b", signal())).toMatchObject({ kind: "image" });
    expect(canvasCalls).toBe(3);
    expect(retry.status().paused).toBe(false);

    const reasons: string[] = [];
    const throttled = createCanvas(
      { ...cfg, onCircuitOpen: (r) => reasons.push(r) },
      tokenFetch(() => new Response(null, { status: 429, headers: { "retry-after": "120" } })),
    );
    expect(await throttled.get("4uLU6hMCjMI75M1A2tKUQC", signal())).toBeNull();
    expect(reasons[0]).toMatch(/drosselt/);
    // während der Pause: nichts mehr abgefragt
    expect(await throttled.get("0VjIjW4GlUZAMYd2vXMi3b", signal())).toBeNull();

    const missing = createCanvas(
      cfg,
      tokenFetch(() => protobuf(new Uint8Array(), 404)),
    );
    expect(await missing.get("4uLU6hMCjMI75M1A2tKUQC", signal())).toBeNull();

    const broken = createCanvas(
      cfg,
      tokenFetch(() => protobuf(new Uint8Array(), 502)),
    );
    await expect(broken.get("4uLU6hMCjMI75M1A2tKUQC", signal())).rejects.toThrow("Spotify-Canvas 502");
    expect(broken.status().paused).toBe(false); // vorübergehend: keine Pause
    expect(await broken.get("", signal())).toBeNull();
  });

  it("Decoder: GIF und Bild, alle bekannten Wire-Types überspringbar, unbekannter Wire-Type ist ein Fehler", () => {
    const fixed64 = [...varint((7 << 3) | 1), 1, 2, 3, 4, 5, 6, 7, 8];
    const fixed32 = [...varint((8 << 3) | 5), 1, 2, 3, 4];
    const num = [...varint((9 << 3) | 0), ...varint(300)];
    const gif = [...field(2, [...Buffer.from("https://x/g.gif")]), ...varint(4 << 3), 4, ...fixed64, ...fixed32, ...num];
    const buf = Uint8Array.from([...num, ...fixed32, ...field(1, gif), ...field(3, [1, 2])]);
    expect(decodeCanvasResponse(buf)).toEqual([{ url: "https://x/g.gif", kind: "gif", entityUri: "" }]);
    // Canvas ohne URL fällt weg
    expect(decodeCanvasResponse(Uint8Array.from(field(1, field(5, [...Buffer.from("spotify:track:x")]))))).toEqual([]);
    expect(() => decodeCanvasResponse(Uint8Array.from([(1 << 3) | 3]))).toThrow(/Wire-Type 3/);
  });
});

describe("Spotify Canvas – gemeinsame Instanz", () => {
  it("liest die Konfiguration aus der Umgebung; ohne sp_dc: nicht konfiguriert", async () => {
    vi.resetModules();
    vi.stubEnv("SPOTIFY_SP_DC", "");
    const { canvasFor, canvasStatus } = await import("@/lib/spotify/canvas-service");
    expect(canvasStatus()).toMatchObject({ id: "spotify-canvas", configured: false });
    expect(await canvasFor("4uLU6hMCjMI75M1A2tKUQC", signal())).toBeNull();
    vi.unstubAllEnvs();
  });
});
