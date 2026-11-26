import { describe, expect, it } from "vitest";
import { diagnose } from "@/lib/debug/diagnose";

const song = (status?: { state: string; provider?: string; detail?: string }, lines: unknown = undefined) => ({
  track: { title: "Neonlicht" },
  artists: [{ name: "Mira Sol" }],
  lyrics: lines === undefined ? undefined : { lines },
  status: status ? { lyrics: status } : {},
});

describe("Kurzdiagnose", () => {
  it("ohne Song: Hinweis auf Spotify", () => {
    expect(diagnose({ song: null })[0]).toMatchObject({ label: "Song", level: "warnung" });
  });

  it("Lyrics: zeigt Zustand, Quelle, Zeilen und die Antworten der Quellen", () => {
    const ok = diagnose({ song: song({ state: "ok", provider: "lrclib", detail: "lrclib: hit" }, [1, 2, 3]) });
    expect(ok.find((f) => f.label === "Lyrics")).toMatchObject({ level: "ok" });
    expect(ok.find((f) => f.label === "Lyrics")!.value).toContain("3 Zeilen");
    const miss = diagnose({ song: song({ state: "missing", detail: "Keine Lyrics gefunden (lrclib: miss, netease: miss)" }) });
    expect(miss.find((f) => f.label === "Lyrics")).toMatchObject({ level: "warnung" });
    expect(miss.find((f) => f.label === "Lyrics")!.value).toContain("netease: miss");
  });

  it("Mikrofon: sagt, was zu tun ist; unsichere Verbindung als Fehler", () => {
    const off = diagnose({ song: song(), live: { micState: "aus" } });
    expect(off.find((f) => f.label === "Mikrofon")!.value).toContain("Mikro an");
    const denied = diagnose({ song: song(), live: { micState: "verweigert" } });
    expect(denied.find((f) => f.label === "Mikrofon")).toMatchObject({ level: "fehler" });
    const http = diagnose({
      song: song(),
      live: { micState: "nicht-verfuegbar" },
      env: { secureContext: false, origin: "http://192.168.1.20:3000" },
    });
    expect(http.find((f) => f.label === "Verbindung")!.value).toContain("http://192.168.1.20:3000");
  });

  it("KI-Regie: Modellname, feste Regeln oder Fehler", () => {
    const regie = (show?: { state: string; provider?: string; detail?: string }, brief = false) =>
      diagnose({ song: { ...song(), status: show ? { show } : {}, ...(brief ? { show: { motto: "x" } } : {}) } }).find(
        (f) => f.label === "KI-Regie",
      )!;
    expect(regie({ state: "ok", provider: "gpt-5.4-mini" }, true)).toMatchObject({ level: "ok" });
    expect(regie({ state: "ok", provider: "gpt-5.4-mini" }, true).value).toContain("ja – gpt-5.4-mini");
    expect(regie({ state: "missing", provider: "regeln" }).value).toContain("festen Regeln");
    expect(regie({ state: "error", detail: "Regie nicht erreichbar" })).toMatchObject({ level: "fehler" });
    expect(regie().value).toBe("noch nicht gefragt");
    expect(regie({ state: "missing", provider: "regeln", detail: "KI gerade nicht erreichbar" })).toMatchObject({
      level: "warnung",
      value: expect.stringContaining("nicht erreichbar"),
    });
  });
});

describe("Kurzdiagnose: Spotify Canvas", () => {
  it("nennt den Grund, warum keine zu sehen ist", async () => {
    const { canvasFinding, diagnose } = await import("@/lib/debug/diagnose");
    expect(canvasFinding({ mode: "aus" })).toMatchObject({ level: "info", value: expect.stringContaining("/einstellungen") });
    expect(canvasFinding({ mode: "buehne", state: "keins" }).value).toContain("keine Canvas");
    expect(canvasFinding({ mode: "buehne", state: "fehler", error: "Spotify 401" })).toMatchObject({
      level: "warnung",
      value: expect.stringContaining("Spotify 401"),
    });
    expect(canvasFinding({ mode: "buehne", state: "da", kind: "video", theme: "jazz", ledWall: false })).toMatchObject({
      level: "warnung",
      value: expect.stringContaining("keine LED-Wand"),
    });
    expect(canvasFinding({ mode: "buehne", state: "da", kind: "video", theme: "club", ledWall: true }).level).toBe("ok");
    expect(canvasFinding({ mode: "vollbild", state: "da", kind: "video" }).value).toContain("Vollbild");
    // in der Gesamtdiagnose
    const all = diagnose({ song: { track: { title: "T" } }, canvas: { mode: "aus" } });
    expect(all.some((f) => f.label === "Canvas")).toBe(true);
  });
});
