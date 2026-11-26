import type { ArtistImage } from "./artist-meta";

/**
 * Genres und Bilder der Künstler im Browser gemerkt (7 Tage): beim Songstart sofort da – die Figuren werden nach Genre
 * gewählt (Rock-Band bekommt Rocker statt einer zufälligen Figur). Beim ersten Mal kommen sie vom Server nach (und
 * meist schon mit „Gleich kommt …“, also bevor der Song beginnt).
 */
type Entry = { genres: string[]; images: ArtistImage[]; at: number };
const KEY = "ss_artist_meta";
const TTL_MS = 7 * 24 * 3600_000;
const MAX = 300;

let memory: Record<string, Entry> | null = null;

function all(now = Date.now()): Record<string, Entry> {
  if (!memory) {
    try {
      memory = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Entry>;
    } catch {
      memory = {};
    }
  }
  for (const [id, e] of Object.entries(memory)) if (!e || now - e.at > TTL_MS) delete memory[id];
  return memory;
}

function save() {
  try {
    const entries = Object.entries(memory ?? {})
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* privater Modus: nur im Speicher */
  }
}

/** Was schon bekannt ist (ohne Netz) */
export function knownArtistMeta(ids: string[]): Record<string, { genres: string[]; images: ArtistImage[] }> {
  const m = all();
  return Object.fromEntries(ids.filter((id) => m[id]).map((id) => [id, { genres: m[id]!.genres, images: m[id]!.images }]));
}

const pending = new Map<string, Promise<void>>();

/** Fehlende Künstler beim Server holen und merken; liefert danach alles Bekannte */
export async function ensureArtistMeta(
  artists: Array<{ spotifyId: string; name: string }>,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, { genres: string[]; images: ArtistImage[] }>> {
  const ids = artists.map((a) => a.spotifyId);
  const missing = artists.filter((a) => /^[A-Za-z0-9]{10,40}$/.test(a.spotifyId) && !all()[a.spotifyId]).slice(0, 5);
  const key = missing.map((a) => a.spotifyId).join(",");
  if (missing.length) {
    const job =
      pending.get(key) ??
      (async () => {
        const q = new URLSearchParams({
          ids: missing.map((a) => a.spotifyId).join("\u001f"),
          names: missing.map((a) => a.name).join("\u001f"),
        });
        const res = await fetchImpl(`/api/artists?${q}`, { cache: "no-store" }).catch(() => null);
        if (!res?.ok) return;
        const body = (await res.json().catch(() => null)) as {
          artists?: Record<string, { genres?: string[]; images?: ArtistImage[] }>;
        } | null;
        const m = all();
        const now = Date.now();
        for (const [id, meta] of Object.entries(body?.artists ?? {}))
          m[id] = { genres: meta.genres ?? [], images: meta.images ?? [], at: now };
        save();
      })().finally(() => pending.delete(key));
    pending.set(key, job);
    await job;
  }
  return knownArtistMeta(ids);
}

/** nur für Tests */
export function resetArtistMetaCache() {
  memory = null;
}
