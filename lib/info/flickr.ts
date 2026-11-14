import { z } from "zod";
import { normalizeLine } from "@/lib/lyrics/text";
import type { Photo } from "@/lib/song-context/schema";

type Http = (url: string, signal?: AbortSignal) => Promise<Response>;

/**
 * Flickr-Lizenzen (flickr.photos.licenses.getInfo). Nur freie Lizenzen ohne „ND“:
 * Fotos werden auf der LED-Wand eingefärbt, das wäre eine Bearbeitung.
 */
export const FLICKR_LICENSES: Record<string, string> = {
  "1": "CC BY-NC-SA 2.0",
  "2": "CC BY-NC 2.0",
  "4": "CC BY 2.0",
  "5": "CC BY-SA 2.0",
  "7": "Keine bekannten Urheberrechtsbeschränkungen",
  "9": "CC0 1.0",
  "10": "Public Domain Mark",
  "11": "CC BY 4.0",
  "12": "CC BY-SA 4.0",
  "14": "CC BY-NC 4.0",
  "15": "CC BY-NC-SA 4.0",
};

const num = z.union([z.number(), z.string()]).transform(Number);
const schema = z.discriminatedUnion("stat", [
  z.object({
    stat: z.literal("ok"),
    photos: z.object({
      photo: z.array(
        z.object({
          id: z.string(),
          owner: z.string(),
          title: z.string().default(""),
          tags: z.string().default(""),
          license: z.union([z.string(), z.number()]).transform(String),
          ownername: z.string().default(""),
          url_l: z.string().optional(),
          width_l: num.optional(),
          height_l: num.optional(),
        }),
      ),
    }),
  }),
  z.object({ stat: z.literal("fail"), code: z.number(), message: z.string() }),
]);

/** Freie Konzertfotos eines Artists; Titel oder Tags müssen den Namen enthalten. */
export async function flickrPhotos(
  name: string,
  apiKey: string,
  http: Http,
  signal?: AbortSignal,
  max = 4,
): Promise<Array<Omit<Photo, "artistId">>> {
  const q = new URLSearchParams({
    method: "flickr.photos.search",
    api_key: apiKey,
    text: `"${name}" live`,
    license: Object.keys(FLICKR_LICENSES).join(","),
    sort: "relevance",
    content_type: "1",
    media: "photos",
    safe_search: "1",
    extras: "owner_name,license,url_l,tags",
    per_page: "30",
    format: "json",
    nojsoncallback: "1",
  });
  const res = await http(`https://api.flickr.com/services/rest/?${q}`, signal);
  if (!res.ok) throw new Error(`Flickr ${res.status}`);
  const body = schema.parse(await res.json());
  if (body.stat === "fail") throw new Error(`Flickr ${body.code}: ${body.message}`);
  const n = normalizeLine(name);
  const compact = n.replace(/\s+/g, "");
  return body.photos.photo
    .filter((p) => FLICKR_LICENSES[p.license] && p.url_l && (p.width_l ?? 0) >= 800)
    .filter((p) => normalizeLine(p.title).includes(n) || p.tags.split(" ").includes(compact))
    .slice(0, max)
    .map((p) => ({
      url: p.url_l!,
      width: p.width_l,
      height: p.height_l,
      kind: "photo" as const,
      source: "flickr" as const,
      credit: p.ownername || p.owner,
      license: FLICKR_LICENSES[p.license]!,
      sourceUrl: `https://www.flickr.com/photos/${p.owner}/${p.id}`,
    }));
}
