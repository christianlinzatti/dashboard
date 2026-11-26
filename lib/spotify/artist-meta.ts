import { z } from "zod";
import { CACHE_TTL } from "@/lib/cache-policy";
import type { Cache } from "@/lib/lyrics/cache";
import { audioDbTags, cleanTags, lastfmTags } from "@/lib/show/tags";

type Http = (url: string, signal?: AbortSignal) => Promise<Response>;
type Call = (path: string) => Promise<Response>;

export type ArtistImage = { url: string; width?: number; height?: number };
export type ArtistMeta = {
  genres: string[];
  images: ArtistImage[];
  /** woher die Genres kommen (für /debug) */
  source: "spotify" | "quellen" | "keine";
};

const spotifyArtist = z.object({
  genres: z.array(z.string()).optional(),
  images: z.array(z.object({ url: z.string().url(), width: z.number().nullish(), height: z.number().nullish() })).optional(),
});

export const artistMetaKey = (id: string) => `artist:meta:v1:${id}`;
export const validArtistId = (id: string) => /^[A-Za-z0-9]{10,40}$/.test(id);

/**
 * Genres und Bilder eines Künstlers: zuerst Spotify (GET /v1/artists/{id}); liefert Spotify keine Genres (manche
 * Apps im Entwicklungsmodus bekommen nicht mehr alle Felder), dann die offenen Quellen, die auch die Show-Regie nutzt
 * (Last.fm, TheAudioDB). Bilder nur von Spotify. Ausfälle einzelner Quellen sind egal.
 */
export async function loadArtistMeta(
  artist: { id: string; name: string },
  deps: { call?: Call; http: Http; audioDbKey: string; lastfmKey?: string; signal?: AbortSignal },
): Promise<ArtistMeta> {
  let genres: string[] = [];
  let images: ArtistImage[] = [];
  if (deps.call) {
    const res = await deps.call(`/artists/${encodeURIComponent(artist.id)}`).catch(() => null);
    const parsed = res?.ok ? spotifyArtist.safeParse(await res.json().catch(() => null)) : null;
    if (parsed?.success) {
      genres = (parsed.data.genres ?? []).slice(0, 8);
      images = (parsed.data.images ?? [])
        .slice(0, 3)
        .map((i) => ({ url: i.url, width: i.width ?? undefined, height: i.height ?? undefined }));
    }
  }
  if (genres.length) return { genres, images, source: "spotify" };
  const [db, fm] = await Promise.allSettled([
    audioDbTags(artist.name, deps.http, deps.audioDbKey, deps.signal),
    deps.lastfmKey ? lastfmTags({ artist: artist.name }, deps.http, deps.lastfmKey, deps.signal) : Promise.resolve([]),
  ]);
  const raw = [...(fm.status === "fulfilled" ? fm.value : []), ...(db.status === "fulfilled" ? db.value.genres : [])];
  genres = cleanTags(raw, [artist.name]).slice(0, 8);
  return { genres, images, source: genres.length ? "quellen" : "keine" };
}

/** Für mehrere Künstler: aus dem Cache, sonst laden und merken (vollständig 7 Tage, ohne Genres 1 Tag) */
export async function artistMetaFor(
  artists: Array<{ id: string; name: string }>,
  deps: Parameters<typeof loadArtistMeta>[1] & { cache: Cache },
): Promise<Record<string, ArtistMeta>> {
  const out: Record<string, ArtistMeta> = {};
  await Promise.all(
    artists
      .filter((a) => validArtistId(a.id))
      .slice(0, 5)
      .map(async (a) => {
        const key = artistMetaKey(a.id);
        const hit = await deps.cache.get<ArtistMeta>(key);
        if (hit) return void (out[a.id] = hit);
        const meta = await loadArtistMeta(a, deps);
        await deps.cache.set(key, meta, meta.genres.length ? CACHE_TTL.artistMeta : CACHE_TTL.artistMetaMissing);
        out[a.id] = meta;
      }),
  );
  return out;
}
