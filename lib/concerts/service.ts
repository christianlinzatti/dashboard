import "server-only";
import { CACHE_TTL } from "@/lib/cache-policy";
import { getCache, type Cache } from "@/lib/lyrics/cache";
import { normalizeLine } from "@/lib/lyrics/text";
import type { Concert } from "@/lib/song-context/schema";
import { createPoliteFetch } from "@/lib/info/http";
import { home } from "./geo";
import { fillCoordinates } from "./geocode";
import { mergeEvents } from "./merge";
import { bandsintown, eventimSearch, lastSetlist, oeticket, ticketmaster, type LastSetlist } from "./providers";
import type { ConcertProvider, RawEvent } from "./types";

/** Aktive Konzert-Provider (nur die mit Zugangsdaten). */
export function concertProviders(env: Record<string, string | undefined> = process.env): ConcertProvider[] {
  return [
    // oeticket braucht keinen Key; mit OETICKET=0 abschaltbar
    ...(env.OETICKET !== "0" ? [oeticket()] : []),
    // Eventim Deutschland: gleiche Schnittstelle; mit EVENTIM_DE=0 abschaltbar
    ...(env.EVENTIM_DE !== "0" ? [eventimSearch("eventim")] : []),
    ...(env.TICKETMASTER_API_KEY ? [ticketmaster(env.TICKETMASTER_API_KEY)] : []),
    ...(env.BANDSINTOWN_APP_ID ? [bandsintown(env.BANDSINTOWN_APP_ID)] : []),
  ];
}

export type ConcertArea = { name: string; lat: number; lon: number; radiusKm: number };

/** Wie eine Quelle für einen Künstler geantwortet hat (für /debug und das Kiosk-Protokoll) */
export type SourceReport = {
  artist: string;
  provider: string;
  state: "ok" | "fehler";
  /** Termine dieser Quelle (vor dem Zusammenführen) */
  events: number;
  /** aus dem Cache statt frisch abgefragt */
  cached: boolean;
  ms?: number;
  error?: string;
};

export type ConcertResult = {
  concerts: Concert[];
  setlists: Record<string, LastSetlist>;
  providers: string[];
  area: { name: string; radiusKm: number };
  sources: SourceReport[];
  /** nur auf Wunsch (/debug): alle Rohtermine je Künstler und Quelle */
  raw?: Array<{ artist: string; provider: string; events: RawEvent[] }>;
};

type CachedLists = {
  lists: Array<{ provider: { id: string; ticketPriority: number }; events: RawEvent[]; ms?: number }>;
  failed: Array<{ id: string; error: string; ms?: number }>;
};

/** Fehlermeldung kurz und ohne Zugangsdaten (Schlüssel stehen in URLs mancher Quellen) */
export function errorText(e: unknown): string {
  const msg = e instanceof Error ? (e.name === "TimeoutError" ? "Zeitüberschreitung (8 s)" : e.message) : String(e);
  const text = msg.replace(/(apikey|app_id|api_key|key)=[^&\s]+/gi, "$1=…").slice(0, 200);
  return /\b403\b/.test(text) ? `${text} – Zugriff gesperrt (Bot-Schutz der Quelle)` : text;
}

export function createConcertService(deps: {
  providers: ConcertProvider[];
  cache: Cache;
  setlistKey?: string;
  today?: () => string;
  setlistFetch?: typeof fetch;
  /** Geocoding für Orte ohne Koordinaten (Nominatim); ohne → Orte bleiben ohne Entfernung */
  geoHttp?: (url: string, signal?: AbortSignal) => Promise<Response>;
}) {
  return async function concertsFor(
    artists: Array<{ id: string; name: string }>,
    signal?: AbortSignal,
    area: ConcertArea = home(),
    opts: { fresh?: boolean; raw?: boolean } = {},
  ): Promise<ConcertResult> {
    const today = deps.today?.() ?? new Date().toISOString().slice(0, 10);
    const all: Concert[] = [];
    const setlists: Record<string, LastSetlist> = {};
    const sources: SourceReport[] = [];
    const raw: NonNullable<ConcertResult["raw"]> = [];
    for (const a of artists.slice(0, 5)) {
      // v2: Eventim mit allen Seiten (v1 sah nur Seite 1) und gemerkten Fehlern
      const key = `concerts:v2:${normalizeLine(a.name)}`;
      let cached = opts.fresh ? null : await deps.cache.get<CachedLists>(key);
      const fromCache = !!cached;
      if (!cached) {
        // je Quelle höchstens 8 s, damit eine hängende Schnittstelle die Karte nicht blockiert
        const timeout = AbortSignal.timeout(8000);
        const sig = signal ? AbortSignal.any([signal, timeout]) : timeout;
        const results = await Promise.allSettled(
          deps.providers.map(async (p) => {
            const t0 = Date.now();
            try {
              return { events: await p.events(a.name, sig), ms: Date.now() - t0 };
            } catch (e) {
              throw Object.assign(new Error(errorText(e)), { ms: Date.now() - t0 });
            }
          }),
        );
        cached = { lists: [], failed: [] };
        deps.providers.forEach((p, i) => {
          const r = results[i]!;
          if (r.status === "fulfilled")
            cached!.lists.push({
              provider: { id: p.id, ticketPriority: p.ticketPriority },
              events: r.value.events,
              ms: r.value.ms,
            });
          else cached!.failed.push({ id: p.id, error: (r.reason as Error).message, ms: (r.reason as { ms?: number }).ms });
        });
        // vollständig: 12 h; fehlt eine Quelle (z. B. Bot-Sperre), nur kurz – dann neuer Versuch
        await deps.cache.set(key, cached, cached.failed.length ? CACHE_TTL.concertsPartial : CACHE_TTL.concerts);
      }
      for (const l of cached.lists) {
        sources.push({
          artist: a.name,
          provider: l.provider.id,
          state: "ok",
          events: l.events.length,
          cached: fromCache,
          ms: l.ms,
        });
      }
      for (const f of cached.failed)
        sources.push({ artist: a.name, provider: f.id, state: "fehler", events: 0, cached: fromCache, ms: f.ms, error: f.error });
      let lists = cached.lists;
      if (deps.geoHttp) {
        const geoHttp = deps.geoHttp;
        lists = await Promise.all(
          lists.map(async (l) => ({
            ...l,
            events: await fillCoordinates(l.events, { cache: deps.cache, http: geoHttp, signal }),
          })),
        );
      }
      // Rohtermine nach dem Geocoding – so sieht /debug auch die ergänzten Koordinaten
      if (opts.raw) for (const l of lists) raw.push({ artist: a.name, provider: l.provider.id, events: l.events });
      all.push(...mergeEvents(a, lists, { today, home: area }));

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
    return {
      concerts: all,
      setlists,
      providers: deps.providers.map((p) => p.id),
      area: { name: area.name, radiusKm: area.radiusKm },
      sources,
      ...(opts.raw ? { raw } : {}),
    };
  };
}

let shared: ReturnType<typeof createConcertService> | undefined;
export function concertsFor(
  artists: Array<{ id: string; name: string }>,
  signal?: AbortSignal,
  area?: ConcertArea,
  opts?: { fresh?: boolean; raw?: boolean },
) {
  shared ??= createConcertService({
    providers: concertProviders(),
    cache: getCache(),
    setlistKey: process.env.SETLISTFM_API_KEY,
    // Nominatim: höchstens 1 Anfrage pro Sekunde (Nutzungsregeln)
    geoHttp:
      process.env.CONCERT_GEOCODING === "0"
        ? undefined
        : createPoliteFetch({ minIntervalMs: { "nominatim.openstreetmap.org": 1100 } }),
  });
  return shared(artists, signal, area, opts);
}
