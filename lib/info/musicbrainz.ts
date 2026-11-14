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

/** Künstler eindeutig finden: hoher Suchscore und gleicher Name (oder Alias). */
export async function findArtist(
  name: string,
  http: (u: string, s?: AbortSignal) => Promise<Response>,
  signal?: AbortSignal,
): Promise<MbArtist | null> {
  const q = new URLSearchParams({ query: `artist:"${name.replace(/"/g, "")}"`, fmt: "json", limit: "5" });
  const s = searchSchema.parse(await getJson(http, `${BASE}/artist?${q}`, signal));
  const hit = s.artists.find((a) => a.score >= 90 && (same(a.name, name) || a.aliases?.some((al) => same(al.name, name))));
  if (!hit) return null;

  const a = lookupSchema.parse(await getJson(http, `${BASE}/artist/${hit.id}?inc=url-rels&fmt=json`, signal));
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
