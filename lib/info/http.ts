/**
 * Höflicher HTTP-Client für öffentliche Datenquellen (MusicBrainz, Wikimedia):
 * eigener User-Agent, Mindestabstand je Host, ein Neuversuch bei 429/503 (Retry-After beachtet).
 * Aus Rechenzentren (Vercel) drosseln die Quellen schnell – daher wenige Anfragen und langer Cache.
 */
export type FetchLike = typeof fetch;

export class SourceBusyError extends Error {}

const DEFAULT_UA = "SonicStage/0.5 (privates Dashboard)";

export function userAgent() {
  // Optional Kontakt angeben (z. B. E-Mail) – MusicBrainz/Wikimedia drosseln anonyme Clients stärker
  const contact = process.env.INFO_CONTACT;
  return contact ? `SonicStage/0.5 ( ${contact} )` : DEFAULT_UA;
}

export function createPoliteFetch(opts: {
  minIntervalMs: Record<string, number>;
  fetch?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
}) {
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const nextSlot = new Map<string, number>();

  const throttle = async (host: string) => {
    const gap = opts.minIntervalMs[host] ?? 0;
    const now = Date.now();
    const at = Math.max(now, nextSlot.get(host) ?? 0);
    nextSlot.set(host, at + gap);
    if (at > now) await sleep(at - now);
  };

  return async function politeFetch(url: string, signal?: AbortSignal): Promise<Response> {
    const host = new URL(url).host;
    for (let attempt = 0; attempt < 2; attempt++) {
      await throttle(host);
      const res = await doFetch(url, { headers: { "User-Agent": userAgent(), Accept: "application/json" }, signal });
      if (res.status !== 429 && res.status !== 503) return res;
      if (attempt === 1) throw new SourceBusyError(`${host} ausgelastet (${res.status})`);
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500, 5000));
    }
    throw new SourceBusyError(host);
  };
}
