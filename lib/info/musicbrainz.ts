import { z } from "zod";
import { normalizeLine } from "@/lib/lyrics/text";
import type { FetchLike } from "./http";
import { SourceBusyError } from "./http";

const BASE = "https://musicbrainz.org/ws/2";

const searchSchema = z.object({
  artists: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      score: z.number(),
      type: z.string().nullable().optional(),
      aliases: z.array(z.object({ name: z.string() })).optional(),
    }),
  ),
});

const lookupSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().nullable().optional(),
  "life-span": z
    .object({
      begin: z.string().nullable().optional(),
      end: z.string().nullable().optional(),
      ended: z.boolean().nullable().optional(),
    })
    .optional(),
  relations: z.array(z.object({ type: z.string(), url: z.object({ resource: z.string() }).optional() })).default([]),
});

export type MbArtist = {
  mbid: string;
  name: string;
  type: "Person" | "Group" | "Other";
  begin?: string;
  end?: string;
  wikidataId?: string;
  /** Dateiname auf Wikimedia Commons (aus der „image“-Beziehung) */
  imageFile?: string;
};

const same = (a: string, b: string) => normalizeLine(a) === normalizeLine(b);

async function getJson(f: FetchLike | ((u: string, s?: AbortSignal) => Promise<Response>), url: string, signal?: AbortSignal) {
  const res = await (f as (u: string, s?: AbortSignal) => Promise<Response>)(url, signal);
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  const body = await res.json();
  // MusicBrainz meldet Überlast teils als 200 mit {"error": "...busy..."}
  if (body && typeof body === "object" && "error" in body) throw new SourceBusyError(String((body as { error: unknown }).error));
  return body;
}

const urlSchema = z.object({
  relations: z.array(z.object({ artist: z.object({ id: z.string(), name: z.string() }).optional() })).default([]),
});

/** Spotify-IDs sind 22 Zeichen Base62 (Demo-IDs wie „demo-mira“ nicht) */
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

/**
 * MusicBrainz-Künstler über den Spotify-Link (MusicBrainz speichert ihn als „free streaming“) – eindeutig, auch bei
 * Namen, die es mehrfach gibt (die Band „Wanda“ hat in der Namenssuche nur 87 Punkte, „Wanda Jackson“ 100).
 */
async function bySpotifyId(
  spotifyId: string,
  name: string,
  http: (u: string, s?: AbortSignal) => Promise<Response>,
  signal?: AbortSignal,
): Promise<string | null> {
  const q = new URLSearchParams({ resource: `https://open.spotify.com/artist/${spotifyId}`, inc: "artist-rels", fmt: "json" });
  const res = await http(`${BASE}/url?${q}`, signal);
  if (res.status === 404) return null; // Link nicht in MusicBrainz eingetragen
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}`);
  const body = await res.json();
  if (body && typeof body === "object" && "error" in body) throw new SourceBusyError(String((body as { error: unknown }).error));
  const artists = urlSchema.parse(body).relations.flatMap((r) => (r.artist ? [r.artist] : []));
  // selten mehrere (z. B. Duo und Mitglied teilen sich ein Profil): der mit gleichem Namen
  return (artists.find((a) => same(a.name, name)) ?? artists[0])?.id ?? null;
}

/**
 * Künstler eindeutig finden: zuerst über die Spotify-ID, sonst Namenssuche mit hohem Suchscore und gleichem Namen
 * (oder Alias).
 */
export async function findArtist(
  name: string,
  http: (u: string, s?: AbortSignal) => Promise<Response>,
  signal?: AbortSignal,
  spotifyId?: string,
): Promise<MbArtist | null> {
  let id = spotifyId && SPOTIFY_ID.test(spotifyId) ? await bySpotifyId(spotifyId, name, http, signal) : null;
  if (!id) {
    const q = new URLSearchParams({ query: `artist:"${name.replace(/"/g, "")}"`, fmt: "json", limit: "5" });
    const s = searchSchema.parse(await getJson(http, `${BASE}/artist?${q}`, signal));
    const hit = s.artists.find((a) => a.score >= 90 && (same(a.name, name) || a.aliases?.some((al) => same(al.name, name))));
    if (!hit) return null;
    id = hit.id;
  }

  const a = lookupSchema.parse(await getJson(http, `${BASE}/artist/${id}?inc=url-rels&fmt=json`, signal));
  const rel = (type: string) => a.relations.find((r) => r.type === type)?.url?.resource;
  const wikidata = rel("wikidata")?.match(/\/(Q\d+)$/)?.[1];
  const image = rel("image")?.match(/\/File:(.+)$/)?.[1];
  return {
    mbid: a.id,
    name: a.name,
    type: a.type === "Person" ? "Person" : a.type === "Group" ? "Group" : "Other",
    begin: a["life-span"]?.begin ?? undefined,
    end: a["life-span"]?.ended ? (a["life-span"]?.end ?? undefined) : undefined,
    wikidataId: wikidata,
    imageFile: image ? decodeURIComponent(image) : undefined,
  };
}
