import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultFetchCertChain } from "@/lib/alexa/verify";

describe("Alexa: Zertifikatskette laden", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("Fehlerantwort → klare Fehlermeldung; jeder Abruf hat ein Zeitlimit", async () => {
    const f = vi.fn<typeof fetch>(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", f);
    await expect(defaultFetchCertChain("https://s3.amazonaws.com/echo.api/fehler.pem")).rejects.toThrow(/nicht ladbar \(503\)/);
    expect(f.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
  });

  it("geladene Kette wird zwischengespeichert (Alexa ruft dieselbe URL immer wieder)", async () => {
    const f = vi.fn(async () => new Response("-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----"));
    vi.stubGlobal("fetch", f);
    const url = "https://s3.amazonaws.com/echo.api/cache-test.pem";
    const a = await defaultFetchCertChain(url);
    const b = await defaultFetchCertChain(url);
    expect(a).toBe(b);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("hängender Abruf bricht ab, sobald das Zeitlimit-Signal auslöst", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            signal = init!.signal!;
            signal.addEventListener("abort", () => reject(new Error("abgebrochen")));
          }),
      ),
    );
    const p = defaultFetchCertChain("https://s3.amazonaws.com/echo.api/haengt.pem");
    expect(signal!.aborted).toBe(false);
    signal!.dispatchEvent(new Event("abort"));
    await expect(p).rejects.toThrow(/abgebrochen/);
  });
});
