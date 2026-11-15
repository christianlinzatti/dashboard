import { execFileSync } from "node:child_process";
import { createSign, X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { handleAlexa, spokenDate, todayVienna, type AlexaRequest } from "@/lib/alexa/handler";
import { isValidCertUrl, verifyAlexaRequest } from "@/lib/alexa/verify";
import { buildSnapshot, firstSentence, snapshotSchema, type CommandInput, type Snapshot } from "@/lib/song-context/snapshot";
import { fixtures } from "@/lib/song-context/fixtures";

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
    releaseYear: 2026,
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

describe("Alexa: Konzerte, Hörstatistik, Likes, Band-Infos", () => {
  const NOW = Date.UTC(2026, 10, 14, 10); // 14.11.2026
  const song = fixtures.neonlicht!;
  const full = (): Snapshot => {
    const s = buildSnapshot(
      {
        song,
        playback: { isPlaying: true, positionMs: 60_000, updatedAt: 0, offsetMs: 0 },
        positionMs: 60_000,
        derived: { section: "verse", lineActive: false, lineIdx: 0, activeSingerId: null } as never,
        live: { bpm: 124 } as never,
      },
      null,
    )!;
    return { ...s, updatedAt: NOW };
  };
  const ask = async (intent: string, slots: Record<string, { value?: string }> = {}, s: Snapshot = full()) => {
    const req = JSON.parse(request({ intent: { name: intent, slots } })) as AlexaRequest;
    const res = await handleAlexa(req, { getSnapshot: async () => s, pushCommand: async () => undefined, now: () => NOW });
    return (res.response as { outputSpeech?: { text: string } }).outputSpeech?.text;
  };

  it("Schnappschuss enthält kompakte Zusatzdaten und bleibt klein", () => {
    const s = full();
    expect(snapshotSchema.safeParse(s).success).toBe(true);
    expect(s.user).toEqual({
      trackSaved: true,
      lovedOnLastfm: false,
      trackPlays: 37,
      artists: [
        { name: "Mira Sol", following: true, plays: 412 },
        { name: "Kai Vento", following: false, plays: 58 },
      ],
    });
    expect(s.concerts?.map((c) => c.city)).toEqual(["Wien", "Linz", "Berlin"]);
    expect(s.about?.[0]).toEqual({
      name: "Mira Sol",
      summary: "Mira Sol ist eine erfundene Sängerin für die Demo dieses Dashboards.",
      facts: ["Geboren 1996", "3 Demo-Alben"],
    });
    expect(JSON.stringify(s).length).toBeLessThan(2000);
  });

  it("ohne Zusatzdaten bleibt der Schnappschuss wie bisher", () => {
    const s = buildSnapshot(
      {
        song: { ...song, user: undefined, concerts: undefined, info: undefined },
        playback: { isPlaying: true, positionMs: 0, updatedAt: 0, offsetMs: 0 },
        positionMs: 0,
        derived: { section: null, lineActive: false, lineIdx: 0, activeSingerId: null } as never,
        live: { bpm: 120 } as never,
      },
      null,
    )!;
    expect(s).not.toHaveProperty("user");
    expect(s).not.toHaveProperty("concerts");
    expect(s).not.toHaveProperty("about");
  });

  it("Konzerte: Umkreis zuerst, Countdown, bestimmter Artist, nichts in der Nähe", async () => {
    expect(await ask("KonzertIntent")).toBe(
      "Mira Sol spielt am Samstag, 5. Dezember in Wien, Gasometer. Das ist in 21 Tagen. Danach noch 1 weiterer Termin in der Nähe.",
    );
    expect(await ask("KonzertIntent", { kuenstler: { value: "kai vento" } })).toBe(
      "Kai Vento spielt am Samstag, 13. Februar in Linz, Posthof. Das ist in 91 Tagen, leider ausverkauft.",
    );
    const far = { ...full(), concerts: full().concerts!.filter((c) => c.city === "Berlin") };
    expect(await ask("KonzertIntent", {}, far)).toBe(
      "In der Nähe von Wien ist nichts geplant. Der nächste Termin: Mira Sol spielt am Samstag, 28. November in Berlin, Columbiahalle. Das ist in 14 Tagen.",
    );
    expect(await ask("KonzertIntent", {}, { ...full(), concerts: undefined })).toBe(
      "Ich habe keine bevorstehenden Konzerte von Mira Sol featuring Kai Vento gefunden.",
    );
  });

  it("Hörstatistik des Songs", async () => {
    expect(await ask("GehoertIntent")).toBe(
      "Neonlicht hast du laut Last.fm 37 Mal gehört. Der Song ist in deinen Lieblingssongs auf Spotify.",
    );
    const neu = { ...full(), user: { trackPlays: 0, lovedOnLastfm: true, artists: [] } };
    expect(await ask("GehoertIntent", {}, neu)).toBe(
      "Neonlicht hörst du laut Last.fm zum ersten Mal. Auf Last.fm hast du ihn mit einem Herz markiert.",
    );
    expect(await ask("GehoertIntent", {}, { ...full(), user: undefined })).toMatch(/keine Daten/);
  });

  it("Mag ich den Künstler? – Follow auf Spotify und Hörzahl", async () => {
    expect(await ask("MagIchIntent")).toBe(
      "Ja, du folgst Mira Sol auf Spotify. Laut Last.fm hast du Mira Sol 412 Mal gehört. Du folgst Kai Vento nicht auf Spotify. Laut Last.fm hast du Kai Vento 58 Mal gehört.",
    );
    expect(await ask("MagIchIntent", { kuenstler: { value: "Mira" } })).toBe(
      "Ja, du folgst Mira Sol auf Spotify. Laut Last.fm hast du Mira Sol 412 Mal gehört.",
    );
    const unbekannt = { ...full(), user: { artists: [{ name: "Mira Sol", following: false }, { name: "Kai Vento" }] } };
    expect(await ask("MagIchIntent", {}, unbekannt)).toBe(
      "Nein, du folgst Mira Sol noch nicht. Zu Kai Vento habe ich keine Daten.",
    );
    expect(await ask("MagIchIntent", {}, { ...full(), user: undefined })).toMatch(/keine Daten/);
  });

  it("Band-Infos: erster Satz und Fakten, wählbarer Artist", async () => {
    expect(await ask("BandInfoIntent")).toBe(
      "Mira Sol ist eine erfundene Sängerin für die Demo dieses Dashboards. Geboren 1996. 3 Demo-Alben.",
    );
    expect(await ask("BandInfoIntent", { kuenstler: { value: "Kai Vento" } })).toBe(
      "Kai Vento ist ein erfundener Rapper für die Demo. Geboren 1993.",
    );
    expect(await ask("BandInfoIntent", {}, { ...full(), about: undefined })).toMatch(/keine Infos/);
  });

  it("Song merken über den Befehlskanal; schon gespeichert → Hinweis", async () => {
    const cmds: unknown[] = [];
    const run = async (intent: string, snap: Snapshot) => {
      const req = JSON.parse(request({ intent: { name: intent } })) as AlexaRequest;
      const res = await handleAlexa(req, {
        getSnapshot: async () => snap,
        pushCommand: async (c) => void cmds.push(c),
        now: () => NOW,
      });
      return (res.response as { outputSpeech?: { text: string } }).outputSpeech?.text;
    };
    expect(await run("MerkenIntent", full())).toBe("Neonlicht ist schon in deinen Lieblingssongs.");
    expect(cmds).toEqual([]);
    expect(await run("NichtMerkenIntent", full())).toBe("Ich entferne Neonlicht aus deinen Lieblingssongs.");
    const notSaved = { ...full(), user: { trackSaved: false, artists: [] } };
    expect(await run("MerkenIntent", notSaved)).toBe("Ich speichere Neonlicht in deinen Lieblingssongs.");
    expect(cmds).toEqual([
      { type: "merken", on: false, trackKey: "demo-neonlicht" },
      { type: "merken", on: true, trackKey: "demo-neonlicht" },
    ]);
  });

  it("Erscheinungsjahr mit Album", async () => {
    expect(await ask("ErscheinungsjahrIntent")).toBe("Neonlicht ist 2026 erschienen, auf dem Album Stadt aus Glas.");
    expect(await ask("ErscheinungsjahrIntent", {}, { ...full(), releaseYear: null })).toBe(
      "Das Erscheinungsjahr von Neonlicht kenne ich nicht.",
    );
  });

  it("Hilfsfunktionen", () => {
    expect(spokenDate("2027-01-06")).toBe("Mittwoch, 6. Jänner");
    expect(todayVienna(Date.UTC(2026, 11, 31, 23, 30))).toBe("2027-01-01"); // Wien ist UTC+1
    expect(firstSentence("Queen ist eine Band. Sie wurde 1970 gegründet.")).toBe("Queen ist eine Band.");
    expect(firstSentence("Die Band „Die 3. Generation“ kommt aus Berlin.")).toBe(
      "Die Band „Die 3. Generation“ kommt aus Berlin.",
    );
    expect(firstSentence("Falco (* 19. Februar 1957 in Wien; † 6. Februar 1998) war ein Sänger. Er gilt als Pionier.")).toBe(
      "Falco (* 19. Februar 1957 in Wien; † 6. Februar 1998) war ein Sänger.",
    );
    expect(firstSentence("Die Band aus St. Pölten spielt z. B. Rock. Mehr folgt.")).toBe(
      "Die Band aus St. Pölten spielt z. B. Rock.",
    );
    expect(firstSentence("x".repeat(400))).toHaveLength(298);
  });
});
