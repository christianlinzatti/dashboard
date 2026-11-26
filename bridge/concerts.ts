import { eventimSearch } from "../lib/concerts/shared/eventim.ts";
import type { BridgeList, BridgeShop } from "../lib/concerts/shared/protocol.ts";

type Http = (url: string, init?: RequestInit) => Promise<Response>;

/** so meldet sich die Bridge bei Eventim: ehrlich als Programm, nicht als Browser */
export const BRIDGE_USER_AGENT = "SonicStage-PiBridge/1.0 (privates Musik-Dashboard)";

/**
 * Rücksichtsvoll fragen: alle Anfragen an Eventim laufen nacheinander durch eine Warteschlange, zwischen zwei Anfragen
 * liegt eine Pause von `gapMs` plus zufällig bis zu `jitterMs` – mehrere Seiten, Shops und Künstler gehen so nicht
 * gebündelt hinaus, sondern verteilt. Die Bridge nennt sich dabei ehrlich (User-Agent), sie gibt sich nicht als
 * Browser aus.
 */
export function politeQueue(
  http: Http,
  opts: {
    gapMs: number;
    jitterMs: number;
    random?: () => number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  },
): Http {
  const random = opts.random ?? Math.random;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  let chain: Promise<unknown> = Promise.resolve();
  let lastAt = -Infinity;
  return (url, init) => {
    const run = chain.then(async () => {
      const wait = lastAt + opts.gapMs + random() * opts.jitterMs - now();
      if (wait > 0) await sleep(wait);
      if (init?.signal?.aborted) throw init.signal.reason ?? new Error("abgebrochen");
      try {
        return await http(url, init);
      } finally {
        lastAt = now();
      }
    });
    // Fehler einer Anfrage halten die Schlange nicht an
    chain = run.catch(() => undefined);
    return run;
  };
}

export type ConcertFetcherOptions = {
  shops: BridgeShop[];
  http: Http;
  /** höchstens so viele Ergebnisseiten je Shop und Künstler */
  maxPages?: number;
  /** Ergebnisse merken: vollständig 12 h, Fehler 30 min */
  okTtlMs?: number;
  errorTtlMs?: number;
  /** je Shop und Künstler höchstens so lange (die Warteschlange verlängert die Dauer) */
  timeoutMs?: number;
  now?: () => number;
};

const MAX_ENTRIES = 300;

/** Konzerttermine für das Dashboard: je Künstler und Shop, mit Cache und ohne doppelte Anfragen. */
export function createConcertFetcher(opts: ConcertFetcherOptions) {
  const now = opts.now ?? Date.now;
  const okTtl = opts.okTtlMs ?? 12 * 3600_000;
  const errorTtl = opts.errorTtlMs ?? 30 * 60_000;
  const providers = opts.shops.map((id) => eventimSearch(id, opts.http, opts.maxPages ?? 8));
  const cache = new Map<string, { until: number; list: BridgeList }>();
  const running = new Map<string, Promise<BridgeList>>();

  const fetchOne = async (p: (typeof providers)[number], artist: string): Promise<BridgeList> => {
    const t0 = now();
    const provider = p.id as BridgeShop;
    try {
      const events = await p.events(artist, AbortSignal.timeout(opts.timeoutMs ?? 90_000));
      return {
        artist,
        provider,
        state: "ok",
        // Künstler und Quelle stehen in der Liste; höchstens 300 Termine (so viele nimmt der Server an)
        events: events.slice(0, 300).map((e) => ({
          date: e.date,
          time: e.time,
          venue: e.venue.slice(0, 200),
          city: e.city.slice(0, 120),
          lat: e.lat,
          lon: e.lon,
          ticketUrl: e.ticketUrl && e.ticketUrl.length <= 600 ? e.ticketUrl : undefined,
          cancelled: e.cancelled,
        })),
        ms: now() - t0,
        cached: false,
      };
    } catch (e) {
      const err = e instanceof Error ? (e.name === "TimeoutError" ? "Zeitüberschreitung" : e.message) : String(e);
      const error = /\b403\b/.test(err) ? `${err} – Zugriff gesperrt (Bot-Schutz der Quelle)` : err;
      return { artist, provider, state: "fehler", events: [], ms: now() - t0, cached: false, error: error.slice(0, 300) };
    }
  };

  const one = (p: (typeof providers)[number], artist: string, fresh: boolean): Promise<BridgeList> => {
    const key = `${p.id}:${artist.toLowerCase()}`;
    const hit = cache.get(key);
    if (!fresh && hit && hit.until > now()) return Promise.resolve({ ...hit.list, cached: true });
    const pending = running.get(key);
    if (pending) return pending;
    const job = fetchOne(p, artist).then((list) => {
      cache.delete(key);
      cache.set(key, { until: now() + (list.state === "ok" ? okTtl : errorTtl), list });
      // ältester Eintrag zuerst hinaus
      while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
      running.delete(key);
      return list;
    });
    running.set(key, job);
    return job;
  };

  return {
    shops: opts.shops,
    /** alle Shops für alle Künstler (die Warteschlange sorgt für die Abstände) */
    async lookup(artists: string[], fresh = false): Promise<BridgeList[]> {
      const jobs = artists.flatMap((a) => providers.map((p) => one(p, a, fresh)));
      return Promise.all(jobs);
    },
    status: () => ({ shops: opts.shops, cached: cache.size, running: running.size }),
  };
}
export type ConcertFetcher = ReturnType<typeof createConcertFetcher>;
