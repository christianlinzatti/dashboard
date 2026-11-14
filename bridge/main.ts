/**
 * Pi-Bridge: verbindet das Dashboard (Browser) mit Geräten im Heimnetz.
 * Start:  node bridge/main.ts [pfad/zur/config.json]   (Node ≥ 22.18, führt TypeScript direkt aus)
 */
import dgram from "node:dgram";
import path from "node:path";
import { loadConfig, resolveLamps } from "./config.ts";
import { LampController } from "./controller.ts";
import { discover } from "./discovery.ts";
import { createBridgeServer } from "./server.ts";

const configPath = process.argv[2] ?? path.join(import.meta.dirname, "config.json");
const cfg = await loadConfig(configPath);

const udp = dgram.createSocket("udp4");
const controller = new LampController([], (payload, ip, port) => udp.send(Buffer.from(payload), port, ip));

async function refreshLamps() {
  const found = await discover().catch((e: Error) => {
    console.error("Gerätesuche fehlgeschlagen:", e.message);
    return [];
  });
  const { lamps, missing } = resolveLamps(cfg, found);
  controller.setLamps(lamps);
  console.log(`Lampen: ${lamps.map((l) => `${l.name} (${l.ip}, ${l.role})`).join(", ") || "keine"}`);
  if (missing.length)
    console.warn(`Nicht gefunden: ${missing.join(", ")} – LAN-Steuerung in der Govee-App aktiv? Sonst feste IP eintragen.`);
}

await refreshLamps();
setInterval(() => void refreshLamps(), 5 * 60_000);
setInterval(() => controller.flush(), 25);

const server = await createBridgeServer({ port: cfg.port, allowedOrigins: cfg.allowedOrigins, controller });
console.log(`Pi-Bridge läuft auf ws://127.0.0.1:${server.port} (Status: http://127.0.0.1:${server.port}/status)`);

const stop = async () => {
  await server.close();
  udp.close();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
