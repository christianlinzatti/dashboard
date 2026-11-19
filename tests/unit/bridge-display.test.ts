import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createDisplay } from "../../bridge/display.ts";
import { createBridgeServer, displayMessage } from "../../bridge/server.ts";
import { LampController } from "../../bridge/controller.ts";
import { createBridgeClient } from "@/lib/bridge/client";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

function setup() {
  let t = 1_000_000;
  const ran: string[] = [];
  const d = createDisplay({ off: "AUS", on: "AN", run: (c) => ran.push(c), now: () => t });
  return { d, ran, advance: (ms: number) => (t += ms) };
}

describe("Bildschirm per HDMI (Pi-Bridge)", () => {
  it("schaltet nur bei Änderung und höchstens alle 10 s; die letzte Anforderung gewinnt", () => {
    const { d, ran, advance } = setup();
    d.forceOn("Start");
    expect(ran).toEqual(["AN"]);
    d.set(true);
    expect(ran).toEqual(["AN"]);
    advance(11_000);
    d.set(false);
    expect(ran).toEqual(["AN", "AUS"]);
    // schnell hin und her: erst nach der Pause, und nur der letzte Wunsch
    advance(1000);
    d.set(true);
    d.set(false);
    d.set(true);
    expect(ran).toEqual(["AN", "AUS"]);
    advance(10_000);
    d.check();
    expect(ran).toEqual(["AN", "AUS", "AN"]);
  });

  it("Sicherheitsnetz: bleibt das Dashboard bei dunklem Bildschirm stumm, geht er wieder an", () => {
    const { d, ran, advance } = setup();
    d.forceOn("Start");
    advance(11_000);
    d.set(false);
    advance(60_000);
    d.alive(); // Lebenszeichen hält den Bildschirm aus
    d.check();
    expect(ran.at(-1)).toBe("AUS");
    advance(121_000);
    d.check();
    expect(ran.at(-1)).toBe("AN");
    expect(d.status()).toMatchObject({ on: true, lastReason: expect.stringContaining("kein Lebenszeichen") });
  });

  it("Dashboard → Bridge: Nachricht passt zum Schema, wird nach dem Verbinden erneut gemeldet und geschaltet", async () => {
    const controller = new LampController([], () => undefined);
    const ran: string[] = [];
    const display = createDisplay({ off: "AUS", on: "AN", run: (c) => ran.push(c), minIntervalMs: 0 });
    const origin = "https://dashboard.example";
    const bridge = await createBridgeServer({ port: 0, allowedOrigins: [origin], controller, display });
    cleanups.push(bridge.close);
    const client = createBridgeClient({
      url: `ws://127.0.0.1:${bridge.port}`,
      createSocket: (url) => new WebSocket(url, { origin }) as never,
    });
    // Wunsch schon vor dem Verbinden: wird beim Öffnen gesendet
    client.display(false);
    client.start();
    await expect.poll(() => ran, { timeout: 3000 }).toEqual(["AUS"]);
    client.display(true);
    await expect.poll(() => ran, { timeout: 3000 }).toEqual(["AUS", "AN"]);
    client.stop();
    expect(displayMessage.safeParse({ type: "display", on: false }).success).toBe(true);
    const status = await (await fetch(`http://127.0.0.1:${bridge.port}/status`)).json();
    expect(status.display).toMatchObject({ on: true });
  });
});
