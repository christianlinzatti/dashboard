import dgram from "node:dgram";
import os from "node:os";
import { commands, GOVEE_MULTICAST, LISTEN_PORT, parseScanResponse, SCAN_PORT, type DiscoveredDevice } from "./govee.ts";

/** IPv4-Adressen aller aktiven Netzwerkkarten (ohne Loopback). */
export function lanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a!.address);
}

/**
 * Sucht Govee-Geräte im Heimnetz (LAN-Steuerung muss in der Govee-App aktiviert sein).
 * Die Suche geht über jede Netzwerkkarte einzeln hinaus – unter Windows (WSL, Hyper-V, VPN) landet
 * Multicast sonst gern auf dem falschen Adapter. Antworten kommen an Port 4002.
 * Adressen/Ports sind für Tests überschreibbar.
 */
export function discover(
  opts: { timeoutMs?: number; scanHost?: string; scanPort?: number; listenPort?: number; interfaces?: string[] } = {},
): Promise<DiscoveredDevice[]> {
  const { timeoutMs = 2000, scanHost = GOVEE_MULTICAST, scanPort = SCAN_PORT, listenPort = LISTEN_PORT } = opts;
  const multicast = scanHost === GOVEE_MULTICAST;
  const interfaces = opts.interfaces ?? (multicast ? lanAddresses() : []);
  return new Promise((resolve, reject) => {
    const found = new Map<string, DiscoveredDevice>();
    const senders: dgram.Socket[] = [];
    const sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const closeAll = () => {
      for (const s of [sock, ...senders])
        try {
          s.close();
        } catch {
          /* schon zu */
        }
    };
    sock.on("error", (e: NodeJS.ErrnoException) => {
      closeAll();
      if (e.code === "EADDRINUSE")
        e.message = `Port ${listenPort} ist belegt – läuft die Bridge schon (oder ein anderes Govee-Programm)? (${e.message})`;
      reject(e);
    });
    sock.on("message", (buf) => {
      const d = parseScanResponse(buf.toString("utf8"));
      if (d) found.set(d.id, d);
    });
    sock.bind(listenPort, () => {
      const payload = Buffer.from(commands.scan());
      // Standardweg (Systemroute) …
      sock.send(payload, scanPort, scanHost);
      // … und zusätzlich gezielt über jede Netzwerkkarte
      for (const address of interfaces) {
        const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
        senders.push(s);
        s.on("error", () => s.close());
        s.bind(0, address, () => {
          try {
            s.setMulticastInterface(address);
            s.send(payload, scanPort, scanHost);
          } catch {
            /* Adapter ohne Multicast – egal */
          }
        });
      }
      setTimeout(() => {
        closeAll();
        resolve([...found.values()]);
      }, timeoutMs);
    });
  });
}
