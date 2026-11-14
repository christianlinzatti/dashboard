import dgram from "node:dgram";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { commands, hexToRgb, parseScanResponse } from "../../bridge/govee.ts";
import { deviceStateFor, diffCommands, type LightSignal } from "../../bridge/mapping.ts";
import { LampController } from "../../bridge/controller.ts";
import { resolveLamps, type BridgeConfig } from "../../bridge/config.ts";
import { createBridgeServer } from "../../bridge/server.ts";
import { discover } from "../../bridge/discovery.ts";

const signal: LightSignal = { base: "#7b2cff", accent: "#ff4fd8", brightness: 0.8, pulse: 1 };

describe("Govee-Protokoll", () => {
  it("baut die LAN-Befehle nach Govee-Doku", () => {
    expect(JSON.parse(commands.scan())).toEqual({ msg: { cmd: "scan", data: { account_topic: "reserve" } } });
    expect(JSON.parse(commands.turn(true))).toEqual({ msg: { cmd: "turn", data: { value: 1 } } });
    expect(JSON.parse(commands.brightness(150))).toEqual({ msg: { cmd: "brightness", data: { value: 100 } } });
    expect(JSON.parse(commands.brightness(0))).toEqual({ msg: { cmd: "brightness", data: { value: 1 } } });
    expect(JSON.parse(commands.color({ r: 1, g: 2, b: 3 }))).toEqual({
      msg: { cmd: "colorwc", data: { color: { r: 1, g: 2, b: 3 }, colorTemInKelvin: 0 } },
    });
  });

  it("liest Suchantworten und ignoriert anderes", () => {
    const raw = JSON.stringify({
      msg: { cmd: "scan", data: { ip: "192.168.1.23", device: "1F:80", sku: "H61A2", bleVersionHard: "3" } },
    });
    expect(parseScanResponse(raw)).toEqual({ ip: "192.168.1.23", id: "1F:80", sku: "H61A2" });
    expect(parseScanResponse('{"msg":{"cmd":"devStatus","data":{}}}')).toBeNull();
    expect(parseScanResponse("kaputt")).toBeNull();
    expect(hexToRgb("#ff8000")).toEqual({ r: 255, g: 128, b: 0 });
  });
});

describe("Rollen", () => {
  it("Puls folgt dem Beat, Grund bleibt ruhig und gedimmt, aus = aus", () => {
    const peak = deviceStateFor(signal, "puls", true);
    const low = deviceStateFor({ ...signal, pulse: 0 }, "puls", true);
    expect(peak.brightness).toBeGreaterThan(low.brightness * 2);
    const ground = deviceStateFor(signal, "grund", true);
    expect(ground.brightness).toBeLessThanOrEqual(60);
    expect(deviceStateFor({ ...signal, pulse: 0 }, "grund", true)).toEqual(ground);
    expect(deviceStateFor(signal, "akzent", false).on).toBe(false);
  });

  it("sendet nur Änderungen", () => {
    const a = deviceStateFor(signal, "akzent", true);
    expect(diffCommands(undefined, a)).toEqual(["turn", "color", "brightness"]);
    expect(diffCommands(a, a)).toEqual([]);
    expect(diffCommands(a, { ...a, brightness: a.brightness - 10 })).toEqual(["brightness"]);
    expect(diffCommands(a, { ...a, on: false })).toEqual(["turn"]);
  });
});

describe("Lampen-Controller", () => {
  it("begrenzt die Senderate je Lampe und schickt den neuesten Zustand nach", () => {
    const sent: Array<{ ip: string; cmd: string }> = [];
    const c = new LampController(
      [{ name: "Strip", ip: "10.0.0.2", role: "puls" }],
      (p, ip) => sent.push({ ip, cmd: JSON.parse(p).msg.cmd }),
      {
        minIntervalMs: 100,
      },
    );
    c.apply(signal, true, 0);
    expect(sent.map((s) => s.cmd)).toEqual(["turn", "colorwc", "brightness"]);
    c.apply({ ...signal, pulse: 0.5 }, true, 20);
    c.apply({ ...signal, pulse: 0 }, true, 40); // zusammengefasst
    expect(sent).toHaveLength(3);
    c.flush(99);
    expect(sent).toHaveLength(3);
    c.flush(100);
    expect(sent.slice(3).map((s) => s.cmd)).toEqual(["brightness"]);
    expect(c.status().commandsSent).toBe(4);
  });
});

describe("Konfiguration", () => {
  it("verbindet Lampen über Modell oder feste IP", () => {
    const cfg: BridgeConfig = {
      allowedOrigins: ["https://x.vercel.app"],
      port: 8787,
      lamps: [
        { name: "Strip", sku: "h61a2", role: "puls" },
        { name: "Fest", ip: "10.0.0.9", role: "grund" },
        { name: "Fehlt", sku: "H6051", role: "grund" },
      ],
    };
    const r = resolveLamps(cfg, [{ ip: "10.0.0.5", id: "a", sku: "H61A2" }]);
    expect(r.lamps.map((l) => [l.name, l.ip])).toEqual([
      ["Strip", "10.0.0.5"],
      ["Fest", "10.0.0.9"],
    ]);
    expect(r.missing).toEqual(["Fehlt"]);
  });
});

// --- Integration: echtes UDP/WebSocket auf 127.0.0.1 mit nachgebildetem Govee-Gerät ---

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

/** Nachgebildetes Govee-Gerät: beantwortet die Suche und protokolliert Steuerbefehle. */
function fakeGovee(scanPort: number) {
  const received: string[] = [];
  const sock = dgram.createSocket("udp4");
  sock.on("message", (buf, rinfo) => {
    const m = JSON.parse(buf.toString());
    if (m.msg.cmd === "scan") {
      const reply = JSON.stringify({ msg: { cmd: "scan", data: { ip: "127.0.0.1", device: "AA:BB", sku: "H61A2" } } });
      sock.send(reply, rinfo.port, rinfo.address);
    } else received.push(m.msg.cmd);
  });
  return new Promise<{ received: string[]; port: number; close: () => void }>((resolve) =>
    sock.bind(scanPort, "127.0.0.1", () =>
      resolve({ received, port: (sock.address() as { port: number }).port, close: () => sock.close() }),
    ),
  );
}

describe("Pi-Bridge (Integration)", () => {
  it("findet ein Gerät per Suche", async () => {
    const dev = await fakeGovee(0);
    cleanups.push(dev.close);
    const found = await discover({ scanHost: "127.0.0.1", scanPort: dev.port, listenPort: 0, timeoutMs: 300 });
    expect(found).toEqual([{ ip: "127.0.0.1", id: "AA:BB", sku: "H61A2" }]);
  });

  it("Dashboard → WebSocket → Govee-Befehle; fremde Herkunft wird abgewiesen", async () => {
    const dev = await fakeGovee(0);
    cleanups.push(dev.close);
    const udp = dgram.createSocket("udp4");
    cleanups.push(() => udp.close());
    // Steuerbefehle an den Port des nachgebildeten Geräts umleiten
    const controller = new LampController(
      [{ name: "Strip", ip: "127.0.0.1", role: "puls" }],
      (p, ip) => udp.send(p, dev.port, ip),
      {
        minIntervalMs: 0,
      },
    );
    const origin = "https://dashboard.example";
    const bridge = await createBridgeServer({ port: 0, allowedOrigins: [origin], controller });
    cleanups.push(bridge.close);

    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, { origin });
    await new Promise((r) => ws.once("open", r));
    ws.send(JSON.stringify({ type: "light", lamps: true, signal }));
    ws.send("kein json");
    ws.send(JSON.stringify({ type: "light", lamps: true, signal: { ...signal, base: "rot" } })); // ungültig → ignoriert
    await expect.poll(() => dev.received, { timeout: 2000 }).toEqual(["turn", "colorwc", "brightness"]);
    ws.close();

    const status = await (await fetch(`http://127.0.0.1:${bridge.port}/status`)).json();
    expect(status.lamps[0]).toMatchObject({ name: "Strip", state: { on: true } });

    const evil = new WebSocket(`ws://127.0.0.1:${bridge.port}`, { origin: "https://boese.example" });
    const result = await new Promise((r) => {
      evil.once("open", () => r("offen"));
      evil.once("error", () => r("abgewiesen"));
    });
    expect(result).toBe("abgewiesen");
  });
});
