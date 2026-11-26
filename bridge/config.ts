import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { DiscoveredDevice } from "./govee.ts";
import type { Lamp } from "./controller.ts";
import { BRIDGE_SHOPS } from "../lib/concerts/shared/protocol.ts";

/**
 * Konzerttermine von oeticket.com und eventim.de über den Heimanschluss abfragen (der Server wird dort gesperrt).
 * Anfragen gehen nacheinander hinaus, mit `gapMs` plus zufällig bis zu `jitterMs` Pause dazwischen.
 */
const concertsSchema = z.object({
  enabled: z.boolean().default(true),
  shops: z
    .array(z.enum(BRIDGE_SHOPS))
    .min(1)
    .default([...BRIDGE_SHOPS]),
  gapMs: z.number().int().min(500).max(60_000).default(1000),
  jitterMs: z.number().int().min(0).max(60_000).default(1500),
  maxPages: z.number().int().min(1).max(8).default(8),
});
/** ohne Eintrag „concerts“ in der config.json: an, beide Shops */
export const CONCERT_DEFAULTS = concertsSchema.parse({});

const configSchema = z.object({
  /** Herkunft(en) des Dashboards, z. B. ["https://dein-projekt.vercel.app"] */
  allowedOrigins: z.array(z.string().url()).min(1),
  port: z.number().int().default(8787),
  lamps: z
    .array(
      z.object({
        name: z.string(),
        role: z.enum(["puls", "akzent", "grund"]),
        /** Geräte-ID aus der Suche (z. B. "1F:80:C5:32:32:36:72:4E") – eindeutig, auch bei gleichen Modellen … */
        id: z.string().optional(),
        /** … oder das Modell (z. B. "H61A2") … */
        sku: z.string().optional(),
        /** … oder feste IP (falls die Suche im Netz nicht funktioniert) */
        ip: z.string().optional(),
      }),
    )
    .min(1),
  /** Watchdog: Befehl, wenn das Dashboard hängt (z. B. „systemctl --user restart sonic-kiosk.service“) */
  watchdog: z
    .object({
      command: z.string().min(1),
      timeoutS: z.number().int().min(20).default(60),
      frameStallS: z.number().int().min(10).default(30),
      cooldownS: z.number().int().min(60).default(300),
    })
    .optional(),
  /**
   * Bildschirm in der Ruhezeit wirklich ausschalten (HDMI): Befehle zum Aus- und Einschalten, z. B.
   * „wlr-randr --output HDMI-A-1 --off“ / „… --on“ (Raspberry Pi OS mit Wayland)
   */
  display: z.object({ off: z.string().min(1), on: z.string().min(1) }).optional(),
  concerts: concertsSchema.optional(),
});
export type BridgeConfig = z.infer<typeof configSchema>;
export type LampConfig = BridgeConfig["lamps"][number];
export type Role = LampConfig["role"];

/** Konfiguration prüfen (wirft mit verständlicher Meldung). */
export function parseConfig(raw: unknown): BridgeConfig {
  return configSchema.parse(raw);
}

export async function loadConfig(path: string): Promise<BridgeConfig> {
  return parseConfig(JSON.parse(await readFile(path, "utf8")));
}

/** Konfigurierte Lampen mit gefundenen Geräten verbinden (feste IP > Geräte-ID > Modell). */
export function resolveLamps(cfg: BridgeConfig, found: DiscoveredDevice[]): { lamps: Lamp[]; missing: string[] } {
  const used = new Set<string>();
  const lamps: Lamp[] = [];
  const missing: string[] = [];
  for (const l of cfg.lamps) {
    const free = found.filter((d) => !used.has(d.ip));
    const ip =
      l.ip ??
      (l.id
        ? free.find((d) => d.id.toUpperCase() === l.id!.toUpperCase())?.ip
        : free.find((d) => d.sku.toUpperCase() === l.sku?.toUpperCase() && !claimedById(cfg, d))?.ip);
    if (!ip) {
      missing.push(l.name);
      continue;
    }
    used.add(ip);
    lamps.push({ name: l.name, role: l.role, ip, sku: l.sku });
  }
  return { lamps, missing };
}

/** Gehört das Gerät per ID fest zu einer Lampe? Dann nimmt es keine andere Lampe über das Modell. */
function claimedById(cfg: BridgeConfig, d: DiscoveredDevice): boolean {
  return cfg.lamps.some((l) => l.id?.toUpperCase() === d.id.toUpperCase());
}

/**
 * Rollen-Vorschlag nach Govee-Modell:
 * Strips (H61xx, H619x) pulsen im Beat, Wand-/Panel-Leuchten (Glide, Hexa, Bars) setzen Akzente,
 * Tisch-/Steh- und sonstige Lampen geben die ruhige Grundfarbe.
 */
export function suggestRole(sku: string): Role {
  const s = sku.toUpperCase();
  if (/^H61/.test(s)) return "puls"; // LED-Strips, TV-Hintergrundlicht
  if (/^H60(4|5[6-7]|6)/.test(s)) return "akzent"; // Light Bars (H604x, H6056/57), Glide/Hexa-Wandleuchten (H606x)
  return "grund"; // Tisch- und Stehlampen, alles andere
}

/**
 * Konfiguration aus gefundenen Geräten zusammenstellen. Bereits bekannte Geräte (gleiche ID) behalten
 * Name und Rolle; neue bekommen einen Vorschlag. Antworten (Name/Rolle/weglassen) überschreiben alles.
 */
export function buildConfig(
  devices: DiscoveredDevice[],
  opts: {
    origin: string;
    existing?: BridgeConfig;
    answers?: Record<string, { name?: string; role?: Role; skip?: boolean }>;
  },
): BridgeConfig {
  const { existing, answers = {} } = opts;
  const known = (d: DiscoveredDevice) => existing?.lamps.find((l) => l.id?.toUpperCase() === d.id.toUpperCase());
  const taken = new Set<string>();
  const lamps: LampConfig[] = [];
  for (const d of devices) {
    const a = answers[d.id] ?? {};
    if (a.skip) continue;
    const prev = known(d);
    let name = a.name?.trim() || prev?.name || d.sku;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${a.name?.trim() || prev?.name || d.sku} ${n}`;
    taken.add(name.toLowerCase());
    lamps.push({ name, role: a.role ?? prev?.role ?? suggestRole(d.sku), id: d.id, sku: d.sku });
  }
  // Lampen mit fester IP (ohne Suche erreichbar) bleiben erhalten
  for (const l of existing?.lamps ?? []) if (l.ip && !l.id) lamps.push(l);
  const origins = [...new Set([opts.origin, ...(existing?.allowedOrigins ?? [])])];
  return parseConfig({
    allowedOrigins: origins,
    port: existing?.port ?? 8787,
    lamps,
    ...(existing?.watchdog ? { watchdog: existing.watchdog } : {}),
  });
}
