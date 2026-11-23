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
});
