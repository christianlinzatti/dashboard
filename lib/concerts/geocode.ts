import { z } from "zod";
import { CACHE_TTL } from "@/lib/cache-policy";
import type { Cache } from "@/lib/lyrics/cache";
import { normalizeLine } from "@/lib/lyrics/text";
import type { RawEvent } from "./types";

type Http = (url: string, signal?: AbortSignal) => Promise<Response>;
const resultSchema = z.array(
  z.object({ lat: z.coerce.number(), lon: z.coerce.number(), name: z.string().optional(), display_name: z.string().optional() }),
);

/** Frei eingegebener Ort (z. B. „Linz“, „Graz, Steiermark“) für die Heimat-Einstellung. */
export async function geocodePlace(query: string, http: Http, signal?: AbortSignal) {
  const q = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", "accept-language": "de" });
  const res = await http(`https://nominatim.openstreetmap.org/search?${q}`, signal);
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const [hit] = resultSchema.parse(await res.json());
  if (!hit || !Number.isFinite(hit.lat) || !Number.isFinite(hit.lon)) return null;
  return { name: hit.name || hit.display_name?.split(",")[0]?.trim() || query, lat: hit.lat, lon: hit.lon };
}

/**
 * Koordinaten einer Stadt über Nominatim (OpenStreetMap). Nutzungsregeln: höchstens 1 Anfrage/s
 * (Drosselung im höflichen Client), eindeutiger User-Agent, Ergebnisse cachen, Quelle nennen.
 */
export async function geocodeCity(city: string, country: string | undefined, http: Http, signal?: AbortSignal) {
  const q = new URLSearchParams({ city, format: "jsonv2", limit: "1", "accept-language": "de" });
  if (country && /^[A-Za-z]{2}$/.test(country)) q.set("countrycodes", country.toLowerCase());
  else if (country) q.set("country", country);
  const res = await http(`https://nominatim.openstreetmap.org/search?${q}`, signal);
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const [hit] = resultSchema.parse(await res.json());
  return hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lon) ? { lat: hit.lat, lon: hit.lon } : null;
}

/**
 * Ergänzt fehlende Koordinaten (aus dem Cache, sonst höchstens `max` neue Abfragen pro Aufruf –
 * der Rest folgt beim nächsten Abruf). Markiert ergänzte Termine mit `geocoded`.
 */
export async function fillCoordinates(
  events: RawEvent[],
  deps: { cache: Cache; http: Http; max?: number; signal?: AbortSignal },
): Promise<RawEvent[]> {
  let budget = deps.max ?? 5;
  const memo = new Map<string, { lat: number; lon: number } | null>();
  const out: RawEvent[] = [];
  for (const e of events) {
    if (e.lat !== undefined && e.lon !== undefined) {
      out.push(e);
      continue;
    }
    const id = `${normalizeLine(e.city)}|${normalizeLine(e.country ?? "")}`;
    let pos = memo.get(id);
    if (pos === undefined) {
      const cached = await deps.cache.get<{ pos: { lat: number; lon: number } | null }>(`geo:v1:${id}`);
      if (cached) pos = cached.pos;
      else if (budget > 0) {
        budget--;
        try {
          pos = await geocodeCity(e.city, e.country, deps.http, deps.signal);
          await deps.cache.set(`geo:v1:${id}`, { pos }, pos ? CACHE_TTL.geoFound : CACHE_TTL.geoMissing);
        } catch {
          pos = null; // Ausfall: nicht cachen, nächstes Mal neu versuchen
        }
      } else pos = null;
      memo.set(id, pos);
    }
    out.push(pos ? { ...e, lat: pos.lat, lon: pos.lon, geocoded: true } : e);
  }
  return out;
}
