import { z } from "zod";

type Http = (url: string, init?: RequestInit) => Promise<Response>;

const trackSchema = z.union([
  z.object({ error: z.object({ code: z.number(), message: z.string().optional() }) }),
  z.object({ isrc: z.string(), bpm: z.number().nullable().optional(), duration: z.number().optional() }),
]);

/**
 * Tempo-Startwert von Deezer (öffentliche API, ohne Key) über die ISRC.
 * Deezer liefert 0, wenn das Tempo unbekannt ist; unbekannte ISRC → Fehler-Objekt (Code 800).
 * Plausibel sind 50–220 BPM; die Dauer muss grob passen (andere Version → kein Wert).
 */
export async function deezerBpm(
  isrc: string,
  durationMs: number | undefined,
  http: Http = fetch,
  signal?: AbortSignal,
): Promise<number | null> {
  if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)) return null;
  const res = await http(`https://api.deezer.com/track/isrc:${isrc}`, { signal });
  if (!res.ok) throw new Error(`Deezer ${res.status}`);
  const body = trackSchema.parse(await res.json());
  if ("error" in body) {
    if (body.error.code === 800) return null; // nicht gefunden
    throw new Error(`Deezer ${body.error.code}`); // z. B. Kontingent (Code 4) – nicht cachen
  }
  if (body.isrc !== isrc) return null;
  if (durationMs && body.duration && Math.abs(body.duration * 1000 - durationMs) > 10_000) return null;
  const bpm = body.bpm ?? 0;
  return bpm >= 50 && bpm <= 220 ? Math.round(bpm * 10) / 10 : null;
}
