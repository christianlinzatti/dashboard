import "server-only";
import { CACHE_TTL } from "@/lib/cache-policy";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import { normalizeLine } from "@/lib/lyrics/text";
import type { Concert } from "@/lib/song-context/schema";
import { home } from "./geo";
import { mergeEvents } from "./merge";
import { bandsintown, lastSetlist, oeticket, ticketmaster, type LastSetlist } from "./providers";
import type { ConcertProvider, RawEvent } from "./types";

/** Aktive Konzert-Provider (nur die mit Zugangsdaten). */
export function concertProviders(env: Record<string, string | undefined> = process.env): ConcertProvider[] {
  return [
    // oeticket braucht keinen Key; mit OETICKET=0 abschaltbar
    ...(env.OETICKET !== "0" ? [oeticket()] : []),
    ...(env.TICKETMASTER_API_KEY ? [ticketmaster(env.TICKETMASTER_API_KEY)] : []),
    ...(env.BANDSINTOWN_APP_ID ? [bandsintown(env.BANDSINTOWN_APP_ID)] : []),
  ];
}

export type ConcertResult = { concerts: Concert[]; setlists: Record<string, LastSetlist>; providers: string[] };

export function createConcertService(deps: {
  providers: ConcertProvider[];
  cache: Cache;
  setlistKey?: string;
  today?: () => string;
  setlistFetch?: typeof fetch;
}) {
  return async function concertsFor(artists: Array<{ id: string; name: string }>, signal?: AbortSignal): Promise<ConcertResult> {
    const today = deps.today?.() ?? new Date().toISOString().slice(0, 10);
    const all: Concert[] = [];
    const setlists: Record<string, LastSetlist> = {};
    for (const a of artists.slice(0, 5)) {
      const key = `concerts:v1:${normalizeLine(a.name)}`;
      let lists = await deps.cache.get<Array<{ provider: { id: string; ticketPriority: number }; events: RawEvent[] }>>(key);
      if (!lists) {
        // je Quelle höchstens 8 s, damit eine hängende Schnittstelle die Karte nicht blockiert
        const timeout = AbortSignal.timeout(8000);
        const sig = signal ? AbortSignal.any([signal, timeout]) : timeout;
        const results = await Promise.allSettled(deps.providers.map((p) => p.events(a.name, sig)));
        lists = deps.providers.flatMap((p, i) => {
          const r = results[i]!;
          return r.status === "fulfilled" ? [{ provider: { id: p.id, ticketPriority: p.ticketPriority }, events: r.value }] : [];
        });
        // vollständig: 12 h; fehlt eine Quelle (z. B. Bot-Sperre), nur kurz – dann neuer Versuch
        const complete = results.every((r) => r.status === "fulfilled");
        await deps.cache.set(key, lists, complete ? CACHE_TTL.concerts : CACHE_TTL.concertsPartial);
      }
      all.push(...mergeEvents(a, lists, { today, home: home() }));

      if (deps.setlistKey) {
        const sk = `setlist:v1:${normalizeLine(a.name)}`;
        let sl = await deps.cache.get<{ v: LastSetlist | null }>(sk);
        if (!sl) {
          try {
            sl = { v: await lastSetlist(deps.setlistKey, a.name, deps.setlistFetch, signal) };
            await deps.cache.set(sk, sl, CACHE_TTL.setlist);
          } catch {
            sl = { v: null };
          }
        }
        if (sl.v) setlists[a.id] = sl.v;
      }
    }
    return { concerts: all, setlists, providers: deps.providers.map((p) => p.id) };
  };
}

let shared: ReturnType<typeof createConcertService> | undefined;
export function concertsFor(artists: Array<{ id: string; name: string }>, signal?: AbortSignal) {
  shared ??= createConcertService({
    providers: concertProviders(),
    cache: getCache(),
    setlistKey: process.env.SETLISTFM_API_KEY,
  });
  return shared(artists, signal);
}
