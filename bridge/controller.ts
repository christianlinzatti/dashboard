import { commands, CONTROL_PORT } from "./govee.ts";
import { deviceStateFor, diffCommands, type DeviceState, type LightSignal, type Role } from "./mapping.ts";

export type Sender = (payload: string, ip: string, port: number) => void;
export type Lamp = { name: string; ip: string; role: Role; sku?: string };

/**
 * Steuert die Lampen: berechnet je Lampe den Zielzustand, sendet nur Änderungen und höchstens
 * alle `minIntervalMs` pro Lampe (Govee-Geräte verkraften keine Befehlsflut). Zwischenstände
 * werden zusammengefasst – es zählt immer der neueste Zustand.
 */
export class LampController {
  private sent = new Map<string, DeviceState>();
  private pending = new Map<string, DeviceState>();
  private lastSendAt = new Map<string, number>();
  private commandsSent = 0;
  lastSignalAt = 0;
  // keine Parameter-Properties: Node führt TypeScript nur „type-stripped“ aus
  private lamps: Lamp[];
  private send: Sender;
  private opts: { minIntervalMs: number };

  constructor(lamps: Lamp[], send: Sender, opts = { minIntervalMs: 100 }) {
    this.lamps = lamps;
    this.send = send;
    this.opts = opts;
  }

  setLamps(lamps: Lamp[]) {
    this.lamps = lamps;
    this.sent.clear();
  }

  apply(signal: LightSignal, lampsOn: boolean, now = Date.now()) {
    this.lastSignalAt = now;
    for (const lamp of this.lamps) this.pending.set(lamp.ip, deviceStateFor(signal, lamp.role, lampsOn));
    this.flush(now);
  }

  /** Regelmäßig aufrufen: sendet zurückgehaltene Zustände, sobald das Intervall abgelaufen ist. */
  flush(now = Date.now()) {
    for (const lamp of this.lamps) {
      const next = this.pending.get(lamp.ip);
      if (!next) continue;
      if (now - (this.lastSendAt.get(lamp.ip) ?? -Infinity) < this.opts.minIntervalMs) continue;
      const prev = this.sent.get(lamp.ip);
      for (const c of diffCommands(prev, next)) {
        const payload =
          c === "turn"
            ? commands.turn(next.on)
            : c === "color"
              ? commands.color(next.color)
              : commands.brightness(next.brightness);
        this.send(payload, lamp.ip, CONTROL_PORT);
        this.commandsSent++;
      }
      this.sent.set(lamp.ip, next);
      this.pending.delete(lamp.ip);
      this.lastSendAt.set(lamp.ip, now);
    }
  }

  status() {
    return {
      lamps: this.lamps.map((l) => ({ ...l, state: this.sent.get(l.ip) ?? null })),
      commandsSent: this.commandsSent,
      lastSignalAt: this.lastSignalAt || null,
    };
  }
}
