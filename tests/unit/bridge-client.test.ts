import { afterEach, describe, expect, it, vi } from "vitest";
import { createBridgeClient, lightMessage, type BridgeState } from "@/lib/bridge/client";
import { lightMessage as serverSchema } from "../../bridge/server.ts";

const frame = (pulse: number) => ({ signal: { base: "#7b2cff", accent: "#ff4fd8", brightness: 0.8, pulse } });

function fakeSocketFactory() {
  const sockets: Array<{ sent: string[]; readyState: number; open(): void; drop(): void } & Record<string, unknown>> = [];
  const create = () => {
    const s = {
      readyState: 0,
      sent: [] as string[],
      onopen: null as (() => void) | null,
      onclose: null as (() => void) | null,
      onerror: null as (() => void) | null,
      send(d: string) {
        this.sent.push(d);
      },
      close() {
        this.readyState = 3;
        this.onclose?.();
      },
      open() {
        this.readyState = 1;
        this.onopen?.();
      },
      drop() {
        this.close();
      },
    };
    sockets.push(s);
    return s;
  };
  return { sockets, create };
}

afterEach(() => vi.useRealTimers());

describe("Bridge-Client", () => {
  it("Nachricht entspricht dem Schema der Bridge", () => {
    expect(serverSchema.safeParse(JSON.parse(lightMessage(frame(0.5), true))).success).toBe(true);
  });

  it("drosselt, sendet nur Änderungen und verbindet sich nach Abbruch neu", () => {
    vi.useFakeTimers();
    const { sockets, create } = fakeSocketFactory();
    const states: BridgeState[] = [];
    const c = createBridgeClient({ url: "ws://x", createSocket: create, minIntervalMs: 50, onState: (s) => states.push(s) });
    c.start();
    sockets[0]!.open();

    c.update(frame(1), true, 1000);
    c.update(frame(0.5), true, 1010); // innerhalb von 50 ms → zurückgehalten
    expect(sockets[0]!.sent).toHaveLength(1);
    vi.advanceTimersByTime(50);
    expect(sockets[0]!.sent).toHaveLength(2);
    c.update(frame(0.5), true, 2000); // unverändert → nicht senden
    expect(sockets[0]!.sent).toHaveLength(2);

    sockets[0]!.drop();
    expect(states.at(-1)).toBe("getrennt");
    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.open();
    expect(states.at(-1)).toBe("verbunden");

    c.stop();
    expect(states.at(-1)).toBe("aus");
    vi.advanceTimersByTime(120_000);
    expect(sockets).toHaveLength(2); // nach stop() kein Neuverbinden
  });
});
