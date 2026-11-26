import { z } from "zod";
import type { ConcertProvider, RawEvent } from "../types";

/*
 * Wird auch von der Pi-Bridge geladen (node bridge/main.ts, ohne Bundler): deshalb nur zod und Typ-Importe, keine
 * „@/“-Pfade und keine Laufzeit-Importe aus dem übrigen Projekt.
 */

/** wie normalizeLine (lib/lyrics/text.ts) – hier eigenständig, siehe oben; ein Test prüft die Gleichheit */
export function normalizeName(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Http = (url: string, init?: RequestInit) => Promise<Response>;
const same = (a: string, b: string) => normalizeName(a) === normalizeName(b);

// --- oeticket (Eventim Österreich, inoffizielle Such-API ohne Key) ---
const oeSchema = z.object({
  fallbackSearch: z.string().optional(), // gesetzt = keine exakten Treffer, Ergebnisse sind unscharf
  totalPages: z.number().default(1),
  products: z
    .array(
      z.object({
        productId: z.union([z.string(), z.number()]).optional(),
        name: z.string(),
        link: z.string().optional(),
        status: z.string().optional(),
        attractions: z.array(z.object({ name: z.string() })).default([]),
        typeAttributes: z.object({
          liveEntertainment: z
            .object({
              startDate: z.string(),
              location: z
                .object({
                  city: z.string().optional(),
                  name: z.string().optional(),
                  geoLocation: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
                })
                .optional(),
            })
            .optional(),
        }),
      }),
    )
    .default([]),
});

/**
 * Tritt der Künstler wirklich auf? Attraktion stimmt überein (auch im Festival-Lineup) oder der Titel
 * beginnt mit dem Namen plus Trennzeichen („KMFDM - Europe 2026“) – nicht „Coldplay Musik bei Kerzenschein“.
 */
export function isOeticketMatch(p: { name: string; attractions: Array<{ name: string }> }, artist: string): boolean {
  if (p.attractions.some((a) => same(a.name, artist))) return true;
  if (p.attractions.length) return false;
  const lower = p.name.toLowerCase();
  const a = artist.toLowerCase();
  return lower.startsWith(a) && /^\s*($|[-–—@:|(,])/.test(p.name.slice(a.length));
}

/** Eventim-Shops mit derselben Such-API (inoffiziell, ohne Key). */
export const EVENTIM_SHOPS = {
  oeticket: { webId: "web__oeticket-at", retailPartner: "EOE", ticketPriority: 1 }, // Österreich: Ticket-Link bevorzugt
  eventim: { webId: "web__eventim-de", retailPartner: undefined, ticketPriority: 1.5 }, // Deutschland
} as const;
export type EventimShop = keyof typeof EVENTIM_SHOPS;
export const eventimShops = Object.keys(EVENTIM_SHOPS) as EventimShop[];

/**
 * Eventim-Suche für einen Shop (oeticket.com, eventim.de). Treffer nur bei echtem Auftritt des Künstlers.
 *
 * Die Suche ist unscharf („Wanda“ findet auch „Wandern“, „Coldplay“ jede Tribute-Show) und nach Datum sortiert –
 * die echten Termine stehen deshalb oft erst auf späteren Seiten. Seite 1 sagt, wie viele Seiten es gibt; die übrigen
 * kommen parallel. Wichtig: ohne `top` – mit `top` liefert die Schnittstelle immer Seite 1, egal welche Seite verlangt
 * wird. Eine Vorstellung kann mehrfach vorkommen (Sitzplatz, Stehplatz, VIP) – je Produkt zählt sie nur einmal.
 */
export function eventimSearch(id: EventimShop, http: Http = fetch, maxPages = 8): ConcertProvider {
  const shop = EVENTIM_SHOPS[id];
  const page = async (artist: string, n: number, signal?: AbortSignal) => {
    const q = new URLSearchParams({
      webId: shop.webId,
      language: "de",
      ...(shop.retailPartner ? { retail_partner: shop.retailPartner } : {}),
      page: String(n),
      sort: "DateAsc",
      search_term: artist,
    });
    const res = await http(`https://public-api.eventim.com/websearch/search/api/exploration/v1/products?${q}`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`${id} ${res.status}`);
    return oeSchema.parse(await res.json());
  };
  return {
    id,
    ticketPriority: shop.ticketPriority,
    async events(artist, signal) {
      const first = await page(artist, 1, signal);
      // unscharfe Ersatzsuche (keine exakten Treffer): weitere Seiten bringen nichts
      const last = first.fallbackSearch ? 1 : Math.min(first.totalPages, maxPages);
      const rest = await Promise.all(Array.from({ length: Math.max(0, last - 1) }, (_, i) => page(artist, i + 2, signal)));
      const out: RawEvent[] = [];
      const seen = new Set<string>();
      for (const p of [first, ...rest].flatMap((b) => b.products)) {
        const le = p.typeAttributes.liveEntertainment;
        if (!le?.location?.city || !isOeticketMatch(p, artist)) continue;
        const key = p.productId !== undefined ? String(p.productId) : `${p.link}|${le.startDate}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          provider: id,
          artistName: artist,
          date: le.startDate.slice(0, 10), // Ortszeit (mit Zeitzonen-Offset geliefert)
          time: le.startDate.slice(11, 16) || undefined,
          venue: le.location.name ?? "",
          city: le.location.city,
          lat: le.location.geoLocation?.latitude,
          lon: le.location.geoLocation?.longitude,
          ticketUrl: p.link,
          cancelled: p.status?.toLowerCase() === "cancelled",
        });
      }
      return out;
    },
  };
}

/** oeticket (Eventim Österreich). */
export const oeticket = (http: Http = fetch, maxPages = 8) => eventimSearch("oeticket", http, maxPages);
