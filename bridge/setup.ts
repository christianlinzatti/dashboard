/**
 * Einrichtung der Bridge: sucht die Govee-Lampen im Heimnetz, lässt jede kurz blinken, fragt Name und
 * Rolle ab und schreibt bridge/config.json. Bereits eingerichtete Lampen (gleiche Geräte-ID) behalten
 * Name und Rolle – das Skript kann also jederzeit erneut laufen, z. B. nach dem Kauf einer neuen Lampe.
 *
 *   node bridge/setup.ts                       interaktiv
 *   node bridge/setup.ts --origin https://dein-projekt.vercel.app --yes   ohne Fragen (Vorschläge übernehmen)
 *
 * Optionen: --config <pfad>  --origin <url>  --yes  --no-blink
 */
import dgram from "node:dgram";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { buildConfig, parseConfig, suggestRole, type BridgeConfig, type Role } from "./config.ts";
import { discover, lanAddresses } from "./discovery.ts";
import { commands, CONTROL_PORT, LISTEN_PORT, type DiscoveredDevice } from "./govee.ts";

const { values: args } = parseArgs({
  options: {
    config: { type: "string" },
    origin: { type: "string" },
    yes: { type: "boolean", short: "y", default: false },
    "no-blink": { type: "boolean", default: false },
  },
});
const configPath = args.config ?? path.join(import.meta.dirname, "config.json");
const interactive = !args.yes && process.stdin.isTTY === true;
const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
const ask = async (q: string, fallback = "") => (await rl?.question(q))?.trim() || fallback;

const ROLES: Record<Role, string> = {
  puls: "springt im Beat (LED-Strips)",
  akzent: "Akzentfarbe, leichter Puls (Wand, Bars)",
  grund: "ruhige Grundfarbe (Tisch-/Stehlampen)",
};

function toOrigin(raw: string): string | undefined {
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = u.hostname === "localhost" || u.hostname.includes(".");
    return /^https?:$/.test(u.protocol) && host ? u.origin : undefined;
  } catch {
    return undefined;
  }
}

// --- vorhandene Konfiguration ---
let existing: BridgeConfig | undefined;
if (existsSync(configPath)) {
  try {
    existing = parseConfig(JSON.parse(await readFile(configPath, "utf8")));
    console.log(
      `Vorhandene Konfiguration: ${configPath} (${existing.lamps.length} Lampen) – bekannte Lampen behalten Name und Rolle.`,
    );
  } catch (e) {
    console.warn(`Vorhandene ${configPath} ist ungültig und wird ersetzt (${(e as Error).message.split("\n")[0]}).`);
  }
}

// --- Suche ---
const nics = lanAddresses();
console.log(`\nSuche Govee-Lampen über ${nics.length ? nics.join(", ") : "die Standardroute"} …`);
const devices = new Map<string, DiscoveredDevice>();
for (let round = 0; round < 3; round++) {
  for (const d of await discover({ timeoutMs: 2500 }).catch((e: Error) => {
    console.error(`Suche fehlgeschlagen: ${e.message}`);
    process.exit(1);
  }))
    devices.set(d.id, d);
  if (devices.size && round >= 1) break;
}
const found = [...devices.values()].sort((a, b) => a.sku.localeCompare(b.sku) || a.ip.localeCompare(b.ip));

if (!found.length) {
  console.error(`
Keine Lampe gefunden. Bitte prüfen:
  1. Govee-Home-App → Lampe → Einstellungen → „LAN-Steuerung“ einschalten (je Lampe, Firmware aktuell).
  2. Rechner und Lampen im selben WLAN/Netz (kein Gäste-WLAN, VPN aus).
  3. Windows: beim ersten Start „Zugriff zulassen“ für Node.js in privaten Netzwerken – oder einmal als Admin:
       New-NetFirewallRule -DisplayName "Sonic Bridge (Govee)" -Direction Inbound -Protocol UDP -LocalPort ${LISTEN_PORT} -Action Allow
     und das WLAN in Windows als „Privates Netzwerk“ einstufen.
  4. Notfalls die IP der Lampe (Router-Oberfläche) mit "ip" statt "id" in config.json eintragen.`);
  rl?.close();
  process.exit(1);
}

console.log(`\nGefunden: ${found.length} Lampe(n)\n`);
for (const [i, d] of found.entries()) {
  const prev = existing?.lamps.find((l) => l.id?.toUpperCase() === d.id.toUpperCase());
  console.log(`  ${i + 1}. ${d.sku.padEnd(7)} ${d.ip.padEnd(15)} ${d.id}${prev ? `  → „${prev.name}“ (${prev.role})` : ""}`);
}

// --- Blinken: Lampe zeigen, danach alten Zustand wiederherstellen ---
const udp = dgram.createSocket({ type: "udp4", reuseAddr: true });
const statusReplies = new Map<string, Record<string, unknown>>();
udp.on("message", (buf, rinfo) => {
  try {
    const m = JSON.parse(buf.toString("utf8"));
    if (m?.msg?.cmd === "devStatus") statusReplies.set(rinfo.address, m.msg.data);
  } catch {
    /* keine Statusantwort */
  }
});
const canBlink =
  !args["no-blink"] &&
  interactive &&
  (await new Promise<boolean>((r) => {
    udp.once("error", () => r(false));
    udp.bind(LISTEN_PORT, () => r(true));
  }));
const send = (ip: string, payload: string) => udp.send(Buffer.from(payload), CONTROL_PORT, ip);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function blink(ip: string) {
  statusReplies.delete(ip);
  send(ip, commands.status());
  await sleep(500);
  const before = statusReplies.get(ip) as
    { onOff?: number; brightness?: number; color?: { r: number; g: number; b: number }; colorTemInKelvin?: number } | undefined;
  send(ip, commands.turn(true));
  send(ip, commands.brightness(100));
  for (const c of [
    { r: 255, g: 0, b: 200 },
    { r: 0, g: 220, b: 255 },
    { r: 255, g: 0, b: 200 },
    { r: 0, g: 220, b: 255 },
  ]) {
    send(ip, commands.color(c));
    await sleep(450);
  }
  if (!before) return;
  if (before.colorTemInKelvin)
    send(
      ip,
      JSON.stringify({
        msg: { cmd: "colorwc", data: { color: { r: 0, g: 0, b: 0 }, colorTemInKelvin: before.colorTemInKelvin } },
      }),
    );
  else if (before.color) send(ip, commands.color(before.color));
  if (before.brightness) send(ip, commands.brightness(before.brightness));
  if (before.onOff === 0) send(ip, commands.turn(false));
}

// --- Dashboard-Adresse ---
let origin = args.origin ? toOrigin(args.origin) : undefined;
if (args.origin && !origin) {
  console.error(`Ungültige Adresse: ${args.origin}`);
  process.exit(1);
}
origin ??= existing?.allowedOrigins[0];
if (interactive) {
  for (;;) {
    const raw = await ask(
      `\nAdresse des Dashboards${origin ? ` [${origin}]` : " (z. B. https://dein-projekt.vercel.app)"}: `,
      origin,
    );
    const o = toOrigin(raw);
    if (o) {
      origin = o;
      break;
    }
    console.log("Bitte eine Adresse wie https://dein-projekt.vercel.app eingeben.");
  }
}
if (!origin) {
  console.error("Dashboard-Adresse fehlt: --origin https://dein-projekt.vercel.app angeben.");
  process.exit(1);
}

// --- je Lampe: Name und Rolle ---
const answers: Record<string, { name?: string; role?: Role; skip?: boolean }> = {};
if (interactive) {
  console.log(
    `\nRollen: ${Object.entries(ROLES)
      .map(([k, v]) => `${k} = ${v}`)
      .join("; ")}`,
  );
  console.log(`Je Lampe: Name eingeben (Enter = Vorschlag), „-“ = Lampe nicht verwenden.`);
  for (const d of found) {
    const prev = existing?.lamps.find((l) => l.id?.toUpperCase() === d.id.toUpperCase());
    console.log(`\n${d.sku} (${d.ip})${canBlink ? " blinkt jetzt pink/türkis …" : ""}`);
    if (canBlink) await blink(d.ip);
    const name = await ask(`  Name [${prev?.name ?? d.sku}]: `);
    if (name === "-") {
      answers[d.id] = { skip: true };
      continue;
    }
    const proposal = prev?.role ?? suggestRole(d.sku);
    let role: Role | undefined;
    while (!role) {
      const r = (await ask(`  Rolle puls/akzent/grund [${proposal}]: `, proposal)).toLowerCase();
      role = (Object.keys(ROLES) as Role[]).find((k) => k.startsWith(r) && r.length > 0);
    }
    answers[d.id] = { name: name || undefined, role };
  }
}
rl?.close();
udp.close();

const cfg = buildConfig(found, { origin, existing, answers });
await writeFile(configPath, `${JSON.stringify(cfg, null, 2)}\n`);
console.log(`\nGespeichert: ${configPath}`);
for (const l of cfg.lamps) console.log(`  ${l.name.padEnd(20)} ${l.role.padEnd(7)} ${l.sku ?? ""} ${l.id ?? l.ip ?? ""}`);
console.log(`\nStarten:  node bridge/main.ts${args.config ? ` ${args.config}` : ""}`);
