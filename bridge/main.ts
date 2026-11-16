/**
 * Pi-Bridge: verbindet das Dashboard (Browser) mit Geräten im Heimnetz. Läuft auf Raspberry Pi, Linux,
 * macOS und Windows.
 * Start:  node bridge/main.ts [pfad/zur/config.json]   (Node ≥ 22.18, führt TypeScript direkt aus)
 * Einrichten (Lampen suchen, config.json schreiben):  node bridge/setup.ts
 */
import { exec } from "node:child_process";
import dgram from "node:dgram";
import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfig, resolveLamps } from "./config.ts";
import { LampController } from "./controller.ts";
import { discover } from "./discovery.ts";
import { createBridgeServer } from "./server.ts";
import { createWatchdog } from "./watchdog.ts";

const configPath = process.argv[2] ?? path.join(import.meta.dirname, "config.json");
if (!existsSync(configPath)) {
  console.error(`Keine Konfiguration unter ${configPath}.\nZuerst einrichten:  node bridge/setup.ts`);
  process.exit(1);
}
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

const wd = cfg.watchdog;
const watchdog = wd
  ? createWatchdog({
      timeoutMs: wd.timeoutS * 1000,
      frameStallMs: wd.frameStallS * 1000,
      cooldownMs: wd.cooldownS * 1000,
      onStall: (reason) => {
        console.warn(`Watchdog: ${reason} – führe aus: ${wd.command}`);
        // über die System-Shell: /bin/sh auf Linux/macOS, cmd.exe unter Windows
        exec(wd.command, (err) => err && console.error("Watchdog-Befehl fehlgeschlagen:", err.message));
      },
    })
  : undefined;
if (watchdog) setInterval(() => watchdog.check(), 5000);

const server = await createBridgeServer({ port: cfg.port, allowedOrigins: cfg.allowedOrigins, controller, watchdog });
console.log(`Bridge läuft auf ws://127.0.0.1:${server.port} (Status: http://127.0.0.1:${server.port}/status)`);
console.log(`Erlaubtes Dashboard: ${cfg.allowedOrigins.join(", ")} – beenden mit Strg+C`);

const stop = async () => {
  await server.close();
  udp.close();
  process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
