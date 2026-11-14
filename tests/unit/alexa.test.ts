import { execFileSync } from "node:child_process";
import { createSign, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { handleAlexa, type AlexaRequest } from "@/lib/alexa/handler";
import { isValidCertUrl, verifyAlexaRequest } from "@/lib/alexa/verify";
import type { CommandInput, Snapshot } from "@/lib/song-context/snapshot";

/**
 * Test-Zertifizierungsstelle zur Laufzeit (kein privater Schlüssel im Repo):
 * Wurzel → Blatt mit SAN echo-api.amazon.com, dazu ein Blatt mit falschem SAN.
 */
type Pki = { root: X509Certificate; chain: string; wrongSanChain: string; key: string; wrongKey: string };
let pki: Pki;

function openssl(dir: string, ...args: string[]) {
  execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
}

beforeAll(() => {
  const dir = mkdtempSync(path.join(tmpdir(), "alexa-pki-"));
  openssl(
    dir,
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    "ca.key",
    "-out",
    "ca.pem",
    "-days",
    "3650",
    "-subj",
    "/CN=Test Root",
  );
  const leaf = (name: string, san: string) => {
    openssl(dir, "req", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", `/CN=${san}`);
    writeFileSync(path.join(dir, `${name}.ext`), `subjectAltName=DNS:${san}\n`);
    openssl(
      dir,
      "x509",
      "-req",
      "-in",
      `${name}.csr`,
      "-CA",
      "ca.pem",
      "-CAkey",
      "ca.key",
      "-CAcreateserial",
      "-out",
      `${name}.pem`,
      "-days",
      "3650",
      "-extfile",
      `${name}.ext`,
    );
  };
  leaf("leaf", "echo-api.amazon.com");
  leaf("bad", "boese.example.com");
  const read = (f: string) => readFileSync(path.join(dir, f), "utf8");
  pki = {
    root: new X509Certificate(read("ca.pem")),
    chain: read("leaf.pem") + read("ca.pem"),
    wrongSanChain: read("bad.pem") + read("ca.pem"),
    key: read("leaf.key"),
    wrongKey: read("bad.key"),
  };
}, 60_000);

const CERT_URL = "https://s3.amazonaws.com/echo.api/echo-api-cert-12.pem";
const sign = (body: string, key: string) => createSign("RSA-SHA256").update(body).sign(key, "base64");

function request(over: Partial<AlexaRequest["request"]> = {}, now = new Date()): string {
  return JSON.stringify({
    version: "1.0",
    context: { System: { application: { applicationId: "amzn1.ask.skill.test" } } },
    request: { type: "IntentRequest", timestamp: now.toISOString(), intent: { name: "WelcherSongIntent" }, ...over },
  });
}

describe("Alexa-Signaturprüfung", () => {
  it("prüft die Zertifikats-URL nach Amazons Regeln", () => {
    expect(isValidCertUrl(CERT_URL)).toBe(true);
    expect(isValidCertUrl("https://s3.amazonaws.com:443/echo.api/x.pem")).toBe(true);
    expect(isValidCertUrl("https://S3.AMAZONAWS.COM/echo.api/../echo.api/x.pem")).toBe(true);
    expect(isValidCertUrl("http://s3.amazonaws.com/echo.api/x.pem")).toBe(false);
    expect(isValidCertUrl("https://notamazon.com/echo.api/x.pem")).toBe(false);
    expect(isValidCertUrl("https://s3.amazonaws.com/EcHo.aPi/x.pem")).toBe(false);
    expect(isValidCertUrl("https://s3.amazonaws.com/invalid.path/x.pem")).toBe(false);
    expect(isValidCertUrl("https://s3.amazonaws.com:563/echo.api/x.pem")).toBe(false);
    expect(isValidCertUrl("https://s3.amazonaws.com/echo.api/../invalid/x.pem")).toBe(false);
    expect(isValidCertUrl(null)).toBe(false);
  });

  const deps = (chain = () => pki.chain) => ({ fetchCertChain: async () => chain(), roots: [pki.root] });

  it("akzeptiert eine korrekt signierte, aktuelle Anfrage", async () => {
    const body = request();
    await expect(
      verifyAlexaRequest(
        { certUrl: CERT_URL, signature256: sign(body, pki.key) },
        body,
        JSON.parse(body).request.timestamp,
        deps(),
      ),
    ).resolves.toBeUndefined();
  });

  it.each([
    [
      "veränderter Inhalt",
      (b: string) => ({ body: b.replace("WelcherSong", "LampenIntent"), sig: sign(b, pki.key), chain: () => pki.chain }),
    ],
    ["falscher Schlüssel", (b: string) => ({ body: b, sig: sign(b, pki.wrongKey), chain: () => pki.chain })],
    ["Zertifikat nicht für echo-api", (b: string) => ({ body: b, sig: sign(b, pki.wrongKey), chain: () => pki.wrongSanChain })],
  ])("weist ab: %s", async (_, make) => {
    const { body, sig, chain } = make(request());
    await expect(
      verifyAlexaRequest({ certUrl: CERT_URL, signature256: sig }, body, JSON.parse(body).request.timestamp, deps(chain)),
    ).rejects.toThrow();
  });

  it("weist veraltete Anfragen, fehlende Signatur und fremde Wurzeln ab", async () => {
    const old = new Date(Date.now() - 10 * 60_000);
    const body = request({}, old);
    await expect(
      verifyAlexaRequest({ certUrl: CERT_URL, signature256: sign(body, pki.key) }, body, old.toISOString(), deps()),
    ).rejects.toThrow(/zu alt/);
    const fresh = request();
    await expect(
      verifyAlexaRequest({ certUrl: CERT_URL, signature256: null }, fresh, JSON.parse(fresh).request.timestamp, deps()),
    ).rejects.toThrow(/Signatur fehlt/);
    await expect(
      verifyAlexaRequest({ certUrl: CERT_URL, signature256: sign(fresh, pki.key) }, fresh, JSON.parse(fresh).request.timestamp, {
        fetchCertChain: async () => pki.chain,
        roots: [], // Test-Wurzel nicht vertrauenswürdig
      }),
    ).rejects.toThrow(/nicht vertrauenswürdig/);
  });

  it("weist abgelaufene Zertifikate ab", async () => {
    const body = request();
    const future = new Date(Date.now() + 20 * 365 * 86_400_000);
    await expect(
      verifyAlexaRequest({ certUrl: CERT_URL, signature256: sign(body, pki.key) }, body, future.toISOString(), {
        ...deps(),
        now: () => future,
      }),
    ).rejects.toThrow(/abgelaufen/);
  });
});

describe("Alexa-Intents", () => {
  const snap: Snapshot = {
    trackKey: "t",
    title: "Neonlicht",
    artists: [
      { name: "Mira Sol", role: "main" },
      { name: "Kai Vento", role: "feature" },
    ],
    album: "Stadt aus Glas",
    isPlaying: true,
    positionMs: 1000,
    durationMs: 200_000,
    section: "verse",
    activeSinger: "Kai Vento",
    line: null,
    bpm: 124,
    palette: { dominant: "#7b2cff", accent: "#ff4fd8" },
    light: null,
    updatedAt: 1_000_000,
  };
  const run = async (intent: string, slots: Record<string, { value?: string }> = {}, s: Snapshot | null = snap) => {
    const cmds: CommandInput[] = [];
    const req = JSON.parse(request({ intent: { name: intent, slots } })) as AlexaRequest;
    const res = await handleAlexa(req, {
      getSnapshot: async () => s,
      pushCommand: async (c) => cmds.push(c),
      now: () => 1_010_000,
    });
    return { text: (res.response as { outputSpeech?: { text: string } }).outputSpeech?.text, cmds };
  };

  it("beantwortet Song- und Sänger-Fragen aus dem Schnappschuss", async () => {
    expect((await run("WelcherSongIntent")).text).toBe("Gerade läuft Neonlicht von Mira Sol featuring Kai Vento.");
    expect((await run("WerSingtIntent")).text).toBe("Gerade singt Kai Vento.");
    expect((await run("WelcherSongIntent", {}, { ...snap, isPlaying: false })).text).toMatch(/^Pausiert/);
    expect((await run("WelcherSongIntent", {}, { ...snap, updatedAt: 0 })).text).toBe("Das Dashboard ist gerade nicht aktiv.");
    expect((await run("WelcherSongIntent", {}, null)).text).toBe("Das Dashboard ist gerade nicht aktiv.");
  });

  it("legt Befehle für das Dashboard ab", async () => {
    expect((await run("LampenIntent", { zustand: { value: "aus" } })).cmds).toEqual([{ type: "lampen", on: false }]);
    expect((await run("StroboIntent", { zustand: { value: "an" } })).cmds).toEqual([{ type: "strobo", on: true }]);
    expect((await run("QualitaetIntent", { stufe: { value: "automatisch" } })).cmds).toEqual([
      { type: "qualitaet", value: "auto" },
    ]);
    const unklar = await run("LampenIntent", { zustand: { value: "lila" } });
    expect(unklar.cmds).toEqual([]);
    expect(unklar.text).toMatch(/an- oder ausschalten/);
  });

  it("Start, Hilfe, Stopp", async () => {
    const launch = await handleAlexa(JSON.parse(request({ type: "LaunchRequest", intent: undefined })), {
      getSnapshot: async () => null,
      pushCommand: async () => undefined,
    });
    expect(launch.response).toMatchObject({ shouldEndSession: false });
    expect((await run("AMAZON.HelpIntent")).text).toMatch(/Welcher Song läuft/);
    expect((await run("AMAZON.StopIntent")).text).toBe("Tschüss!");
  });
});
