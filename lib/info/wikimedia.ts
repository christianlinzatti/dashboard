import { z } from "zod";

type Http = (url: string, signal?: AbortSignal) => Promise<Response>;

// --- Wikidata: Wikipedia-Titel (de/en) und Bild (P18) ---
const entitySchema = z.object({
  entities: z.record(
    z.string(),
    z.object({
      sitelinks: z.record(z.string(), z.object({ title: z.string() })).default({}),
      claims: z
        .record(z.string(), z.array(z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.unknown() }).optional() }) })))
        .default({}),
    }),
  ),
});

export type WikidataInfo = { dewiki?: string; enwiki?: string; image?: string };

export async function wikidataEntity(qid: string, http: Http, signal?: AbortSignal): Promise<WikidataInfo> {
  const res = await http(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(qid)}.json`, signal);
  if (!res.ok) throw new Error(`Wikidata ${res.status}`);
  const e = Object.values(entitySchema.parse(await res.json()).entities)[0];
  const image = e?.claims.P18?.[0]?.mainsnak.datavalue?.value;
  return {
    dewiki: e?.sitelinks.dewiki?.title,
    enwiki: e?.sitelinks.enwiki?.title,
    image: typeof image === "string" ? image : undefined,
  };
}

// --- Wikipedia: Kurzfassung (REST „page/summary“) ---
const summarySchema = z.object({
  type: z.string(),
  extract: z.string().default(""),
  content_urls: z.object({ desktop: z.object({ page: z.string() }) }),
});

export type WikiSummary = { text: string; url: string; lang: "de" | "en" };

/** Erste Sätze bis ca. 320 Zeichen, an Satzgrenze abgeschnitten. */
export function shorten(text: string, max = 320): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > 80 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))} …`;
}

export async function wikipediaSummary(
  lang: "de" | "en",
  title: string,
  http: Http,
  signal?: AbortSignal,
): Promise<WikiSummary | null> {
  const res = await http(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
    signal,
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const s = summarySchema.parse(await res.json());
  if (s.type === "disambiguation" || !s.extract) return null;
  return { text: shorten(s.extract), url: s.content_urls.desktop.page, lang };
}

// --- Commons: Bild-URL in passender Größe, Urheber und Lizenz ---
const imageInfoSchema = z.object({
  query: z.object({
    pages: z.array(
      z.object({
        imageinfo: z
          .array(
            z.object({
              thumburl: z.string().optional(),
              url: z.string(),
              thumbwidth: z.number().optional(),
              thumbheight: z.number().optional(),
              descriptionurl: z.string(),
              extmetadata: z.record(z.string(), z.object({ value: z.unknown() })).default({}),
            }),
          )
          .optional(),
      }),
    ),
  }),
});

export type CommonsImage = { url: string; width?: number; height?: number; credit: string; license: string; sourceUrl: string };

export const stripHtml = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Freie Lizenzen, die wir mit Urheberangabe zeigen dürfen. */
const FREE = /^(cc0|cc[ -]by(-sa)?([ -]\d\.\d)?|public domain|pd|gfdl|cc by|cc by-sa)/i;

export async function commonsImage(file: string, http: Http, signal?: AbortSignal, width = 1280): Promise<CommonsImage | null> {
  const q = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: String(width),
    iiextmetadatafilter: "Artist|LicenseShortName|Credit",
    titles: `File:${file}`,
  });
  const res = await http(`https://commons.wikimedia.org/w/api.php?${q}`, signal);
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  const ii = imageInfoSchema.parse(await res.json()).query.pages[0]?.imageinfo?.[0];
  if (!ii) return null;
  const meta = (k: string) => (typeof ii.extmetadata[k]?.value === "string" ? stripHtml(ii.extmetadata[k]!.value as string) : "");
  const license = meta("LicenseShortName");
  if (!FREE.test(license)) return null; // unklare Lizenz → nicht anzeigen
  return {
    url: ii.thumburl ?? ii.url,
    width: ii.thumbwidth,
    height: ii.thumbheight,
    credit: meta("Artist") || meta("Credit") || "Unbekannt",
    license,
    sourceUrl: ii.descriptionurl,
  };
}
