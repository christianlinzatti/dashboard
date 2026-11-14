/**
 * Govee LAN-API (lokal, UDP). Geräte müssen in der Govee-Home-App „LAN-Steuerung“ aktiviert haben.
 * - Suche: Multicast an 239.255.255.250:4001, Antworten kommen an Port 4002
 * - Befehle: an <Geräte-IP>:4003
 */
import { z } from "zod";

export const GOVEE_MULTICAST = "239.255.255.250";
export const SCAN_PORT = 4001;
export const LISTEN_PORT = 4002;
export const CONTROL_PORT = 4003;

export type Rgb = { r: number; g: number; b: number };

const msg = (cmd: string, data: unknown) => JSON.stringify({ msg: { cmd, data } });

export const commands = {
  scan: () => msg("scan", { account_topic: "reserve" }),
  turn: (on: boolean) => msg("turn", { value: on ? 1 : 0 }),
  /** Helligkeit 1–100 */
  brightness: (percent: number) => msg("brightness", { value: Math.min(100, Math.max(1, Math.round(percent))) }),
  /** RGB-Farbe (Farbtemperatur 0 = reine RGB-Steuerung) */
  color: (c: Rgb) => msg("colorwc", { color: { r: c.r, g: c.g, b: c.b }, colorTemInKelvin: 0 }),
  status: () => msg("devStatus", {}),
};

const scanResponse = z.object({
  msg: z.object({
    cmd: z.literal("scan"),
    data: z.object({ ip: z.string(), device: z.string(), sku: z.string() }).passthrough(),
  }),
});

export type DiscoveredDevice = { ip: string; id: string; sku: string };

/** Antwort eines Geräts auf die Suche auswerten (andere Nachrichten → null). */
export function parseScanResponse(raw: string): DiscoveredDevice | null {
  try {
    const r = scanResponse.safeParse(JSON.parse(raw));
    return r.success ? { ip: r.data.msg.data.ip, id: r.data.msg.data.device, sku: r.data.msg.data.sku } : null;
  } catch {
    return null;
  }
}

export function hexToRgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return { r: 255, g: 255, b: 255 };
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) };
}
