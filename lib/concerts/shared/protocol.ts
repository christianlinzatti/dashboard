import { z } from "zod";
import type { RawEvent } from "../types";

/*
 * Konzert-Abfrage über die Pi-Bridge: Eventim (oeticket.com, eventim.de) sperrt Rechenzentrums-Adressen wie die des
 * Servers (403, Bot-Schutz). Die Bridge fragt deshalb vom Heimanschluss aus, der Kiosk reicht das Ergebnis an
 * /api/concerts weiter. Wird von Bridge, Browser und Server geladen – nur zod und Typ-Importe.
 */

export const BRIDGE_SHOPS = ["oeticket", "eventim"] as const;
export type BridgeShop = (typeof BRIDGE_SHOPS)[number];

/** Kiosk → Bridge: Termine für diese Künstler (höchstens 5) */
export const concertsRequest = z.object({
  type: z.literal("concerts"),
  /** ordnet die Antwort der Anfrage zu */
  id: z.string().min(1).max(40),
  artists: z.array(z.string().trim().min(1).max(200)).min(1).max(5),
  /** ohne Cache der Bridge (nur /debug, „Ohne Cache“) */
  fresh: z.boolean().optional(),
});
export type ConcertsRequest = z.infer<typeof concertsRequest>;

/** Ticket-Links nur zu den Shops selbst (die Liste kommt vom Browser, nicht vom Server) */
const TICKET_HOSTS = /(^|\.)(oeticket\.com|eventim\.de|eventim\.com)$/i;
export function safeTicketUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && TICKET_HOSTS.test(u.hostname) ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

const text = (max: number) => z.string().max(max);
const rawEvent = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    venue: text(200),
    city: text(120).min(1),
    country: text(8).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    ticketUrl: text(600).optional(),
    soldOut: z.boolean().optional(),
    cancelled: z.boolean().optional(),
  })
  .strip();

/** Ergebnis einer Quelle für einen Künstler */
export const bridgeList = z.object({
  artist: z.string().trim().min(1).max(200),
  provider: z.enum(BRIDGE_SHOPS),
  state: z.enum(["ok", "fehler"]),
  events: z.array(rawEvent).max(300).default([]),
  ms: z.number().int().min(0).max(600_000).optional(),
  cached: z.boolean().default(false),
  error: text(300).optional(),
});
export type BridgeList = z.infer<typeof bridgeList>;

/** Bridge → Kiosk */
export const concertsResponse = z.object({
  type: z.literal("concerts"),
  id: z.string().min(1).max(40),
  results: z.array(bridgeList).max(20),
  /** Konzertabfrage in der config.json der Bridge abgeschaltet */
  off: z.boolean().optional(),
});
export type ConcertsResponse = z.infer<typeof concertsResponse>;

/** Rohtermine aus einer Bridge-Liste (Künstler und Quelle aus der Liste, Ticket-Links geprüft) */
export function bridgeEvents(l: BridgeList): RawEvent[] {
  return l.events.map((e) => ({
    ...e,
    provider: l.provider,
    artistName: l.artist,
    ticketUrl: safeTicketUrl(e.ticketUrl),
  }));
}
