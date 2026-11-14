import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { DiscoveredDevice } from "./govee.ts";
import type { Lamp } from "./controller.ts";

const configSchema = z.object({
  /** Herkunft(en) des Dashboards, z. B. ["https://dein-projekt.vercel.app"] */
  allowedOrigins: z.array(z.string().url()).min(1),
  port: z.number().int().default(8787),
  lamps: z
    .array(
      z.object({
        name: z.string(),
        role: z.enum(["puls", "akzent", "grund"]),
        /** Gerät über das Modell finden (z. B. "H61A2") … */
        sku: z.string().optional(),
        /** … oder feste IP (falls die Suche im Netz nicht funktioniert) */
        ip: z.string().optional(),
      }),
    )
    .min(1),
});
export type BridgeConfig = z.infer<typeof configSchema>;

export async function loadConfig(path: string): Promise<BridgeConfig> {
  return configSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

/** Konfigurierte Lampen mit gefundenen Geräten verbinden (feste IP > Modell). */
export function resolveLamps(cfg: BridgeConfig, found: DiscoveredDevice[]): { lamps: Lamp[]; missing: string[] } {
  const used = new Set<string>();
  const lamps: Lamp[] = [];
  const missing: string[] = [];
  for (const l of cfg.lamps) {
    const ip = l.ip ?? found.find((d) => d.sku.toUpperCase() === l.sku?.toUpperCase() && !used.has(d.ip))?.ip;
    if (!ip) {
      missing.push(l.name);
      continue;
    }
    used.add(ip);
    lamps.push({ name: l.name, role: l.role, ip, sku: l.sku });
  }
  return { lamps, missing };
}
