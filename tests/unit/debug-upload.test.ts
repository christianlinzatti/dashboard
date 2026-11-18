import { describe, expect, it, vi } from "vitest";
import { DEBUG_MAX_BYTES, parseDebugUpload, sendDebugContext } from "@/lib/live/debug-upload";
import { memoryCache } from "@/lib/lyrics/cache";

vi.mock("server-only", () => ({}));

describe("Song-Kontext an den Server (Debug)", () => {
  it("prüft Größe, JSON und Form", () => {
    expect(parseDebugUpload(JSON.stringify({ sentAt: 1, context: { a: 1 } }))).toMatchObject({ ok: true });
    expect(parseDebugUpload("{kaputt")).toMatchObject({ ok: false, status: 400 });
    expect(parseDebugUpload(JSON.stringify({ sentAt: 1, context: "nein" }))).toMatchObject({ ok: false, status: 400 });
    const big = JSON.stringify({ sentAt: 1, context: { x: "a".repeat(DEBUG_MAX_BYTES) } });
    expect(parseDebugUpload(big)).toMatchObject({ ok: false, status: 413 });
  });

  it("Speicher: je Nutzer, mit Empfangszeit", async () => {
    const { createDebugStore } = await import("@/lib/server/debug-store");
    const store = createDebugStore(memoryCache());
    await store.save("u1", { sentAt: 1, context: { song: { title: "A" } }, receivedAt: 2 });
    expect(await store.get("u1")).toMatchObject({ context: { song: { title: "A" } }, receivedAt: 2 });
    expect(await store.get("u2")).toBeNull();
  });

  it("Senden meldet Erfolg, fehlende Anmeldung und Fehler verständlich", async () => {
    const ok = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await sendDebugContext({ a: 1 }, ok as unknown as typeof fetch)).toContain("/debug");
    const body = JSON.parse((ok.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.context).toEqual({ a: 1 });
    const anon = async () => new Response("{}", { status: 401 });
    expect(await sendDebugContext({}, anon as unknown as typeof fetch)).toContain("Nicht angemeldet");
    const down = async () => {
      throw new Error("offline");
    };
    expect(await sendDebugContext({}, down as unknown as typeof fetch)).toBe("Keine Verbindung zum Server");
  });
});
