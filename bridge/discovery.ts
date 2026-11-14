import dgram from "node:dgram";
import { commands, GOVEE_MULTICAST, LISTEN_PORT, parseScanResponse, SCAN_PORT, type DiscoveredDevice } from "./govee.ts";

/**
 * Sucht Govee-Geräte im Heimnetz (LAN-Steuerung muss in der Govee-App aktiviert sein).
 * Adressen/Ports sind für Tests überschreibbar.
 */
export function discover(
  opts: { timeoutMs?: number; scanHost?: string; scanPort?: number; listenPort?: number } = {},
): Promise<DiscoveredDevice[]> {
  const { timeoutMs = 2000, scanHost = GOVEE_MULTICAST, scanPort = SCAN_PORT, listenPort = LISTEN_PORT } = opts;
  return new Promise((resolve, reject) => {
    const found = new Map<string, DiscoveredDevice>();
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    sock.on("error", (e) => {
      sock.close();
      reject(e);
    });
    sock.on("message", (buf) => {
      const d = parseScanResponse(buf.toString("utf8"));
      if (d) found.set(d.id, d);
    });
    sock.bind(listenPort, () => {
      const payload = Buffer.from(commands.scan());
      sock.send(payload, scanPort, scanHost);
      setTimeout(() => {
        sock.close();
        resolve([...found.values()]);
      }, timeoutMs);
    });
  });
}
