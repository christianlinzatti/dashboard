import { normalizeLine } from "@/lib/lyrics/text";
import type { Concert } from "@/lib/song-context/schema";
import { distanceKm } from "./geo";
import type { ConcertProvider, RawEvent } from "./types";

const cityKey = (c: string) =>
  normalizeLine(c)
    .replace(/\b(wien|vienna)\b/, "wien")
    .replace(/\b(munchen|munich)\b/, "munchen");

/**
 * Termine aus mehreren Quellen zusammenführen: gleicher Tag + gleiche Stadt = ein Konzert.
 * Ticket-Link von der bevorzugten Quelle, „ausverkauft“ wenn eine Quelle es meldet.
 * Abgesagte und vergangene Termine fallen weg. Sortierung: im Umkreis zuerst, dann nach Datum.
 */
export function mergeEvents(
  artist: { id: string; name: string },
  lists: Array<{ provider: Pick<ConcertProvider, "id" | "ticketPriority">; events: RawEvent[] }>,
  opts: { today: string; home: { name?: string; lat: number; lon: number; radiusKm: number }; limit?: number },
): Concert[] {
  const byKey = new Map<string, { c: Concert; prio: number; cancelled: boolean }>();
  for (const { provider, events } of lists) {
    for (const e of events) {
      if (e.date < opts.today) continue;
      const key = `${e.date}|${cityKey(e.city)}`;
      const dist =
        e.lat !== undefined && e.lon !== undefined
          ? Math.round(distanceKm(opts.home, { lat: e.lat, lon: e.lon }))
          : opts.home.name && cityKey(e.city) === cityKey(opts.home.name)
            ? 0 // ohne Koordinaten: Heimatstadt erkennen
            : undefined;
      const prev = byKey.get(key);
      if (!prev) {
        byKey.set(key, {
          prio: provider.ticketPriority,
          cancelled: !!e.cancelled,
          c: {
            artistId: artist.id,
            artistName: artist.name,
            date: e.date,
            ...(e.time ? { time: e.time } : {}),
            venue: e.venue,
            city: e.city,
            ...(e.country ? { country: e.country } : {}),
            ...(dist !== undefined ? { distanceKm: dist } : {}),
            ...(e.ticketUrl ? { ticketUrl: e.ticketUrl } : {}),
            ...(e.soldOut ? { soldOut: true } : {}),
            providers: [provider.id],
          },
        });
        continue;
      }
      prev.c.providers.push(provider.id);
      prev.cancelled ||= !!e.cancelled;
      if (e.soldOut) prev.c.soldOut = true;
      if (prev.c.distanceKm === undefined && dist !== undefined) prev.c.distanceKm = dist;
      if (!prev.c.time && e.time) prev.c.time = e.time;
      if (e.ticketUrl && (provider.ticketPriority < prev.prio || !prev.c.ticketUrl)) {
        prev.c.ticketUrl = e.ticketUrl;
        prev.prio = provider.ticketPriority;
      }
    }
  }
  const radius = opts.home.radiusKm;
  const near = (c: Concert) => c.distanceKm !== undefined && c.distanceKm <= radius;
  return [...byKey.values()]
    .filter((x) => !x.cancelled)
    .map((x) => x.c)
    .sort((a, b) => Number(near(b)) - Number(near(a)) || a.date.localeCompare(b.date))
    .slice(0, opts.limit ?? 5);
}
