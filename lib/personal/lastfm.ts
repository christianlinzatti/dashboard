import { z } from "zod";

/**
 * Last.fm (API-Key + Benutzername, nur Lesezugriff). Formate nach der offiziellen Doku;
 * Zahlen kommen als Strings, Fehler als {"error": <Code>, "message": "..."}.
 */
const BASE = "https://ws.audioscrobbler.com/2.0/";
type Http = (url: string, signal?: AbortSignal) => Promise<Response>;

/** Last.fm liefert für Titel ohne Cover einen grauen Stern (immer dieselbe Datei) – dann lieber gar kein Bild */
const LASTFM_PLACEHOLDER = "2a96cbd8b46e442fc41c2b86b821562f";

/** Größtes vorhandenes Cover */
export function coverOf(images: Array<{ "#text": string }>): string | undefined {
  const url = [...images].reverse().find((i) => i["#text"])?.["#text"];
  return url && !url.includes(LASTFM_PLACEHOLDER) ? url : undefined;
}

export class LastfmError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

const num = z.coerce.number().int().nonnegative();
const image = z.object({ size: z.string(), "#text": z.string() });

const recentSchema = z.object({
  recenttracks: z.object({
    track: z.array(
      z.object({
        name: z.string(),
        // extended=1 → {name}, sonst {"#text"}
        artist: z.object({ name: z.string().optional(), "#text": z.string().optional() }),
        album: z.object({ "#text": z.string() }).partial().optional(),
        image: z.array(image).default([]),
        url: z.string().optional(),
        loved: z.string().optional(),
        date: z.object({ uts: num }).optional(),
        "@attr": z.object({ nowplaying: z.string() }).partial().optional(),
      }),
    ),
  }),
});

export type RecentTrack = {
  title: string;
  artist: string;
  album?: string;
  imageUrl?: string;
  /** Unix-Zeit (s); fehlt beim gerade laufenden Song */
  playedAt?: number;
  nowPlaying: boolean;
  loved: boolean;
  url?: string;
};

const trackInfoSchema = z.object({
  track: z.object({ userplaycount: num.optional(), userloved: z.string().optional() }),
});
const artistInfoSchema = z.object({
  artist: z.object({
    name: z.string(),
    stats: z.object({ userplaycount: num.optional() }).optional(),
    tags: z.object({ tag: z.array(z.object({ name: z.string() })).or(z.object({ name: z.string() })) }).optional(),
  }),
});

const similarSchema = z.object({
  similarartists: z.object({
    artist: z.array(z.object({ name: z.string(), match: z.coerce.number().min(0).max(1).catch(0) })),
  }),
});

/** So ähnlich (0..1, laut Last.fm) muss ein Künstler mindestens sein */
export const MIN_SIMILAR_MATCH = 0.15;

export function createLastfm(cfg: { apiKey: string; user: string }, http: Http) {
  const call = async (params: Record<string, string>, signal?: AbortSignal) => {
    const q = new URLSearchParams({ ...params, api_key: cfg.apiKey, format: "json" });
    const res = await http(`${BASE}?${q}`, signal);
    const body = (await res.json().catch(() => ({}))) as { error?: number; message?: string };
    if (typeof body.error === "number") throw new LastfmError(body.error, body.message ?? "Last.fm-Fehler");
    if (!res.ok) throw new LastfmError(res.status, `Last.fm ${res.status}`);
    return body;
  };

  return {
    async recentTracks(limit = 10, signal?: AbortSignal): Promise<RecentTrack[]> {
      const r = recentSchema.parse(
        await call({ method: "user.getrecenttracks", user: cfg.user, limit: String(limit), extended: "1" }, signal),
      );
      return r.recenttracks.track.map((t) => ({
        title: t.name,
        artist: t.artist.name ?? t.artist["#text"] ?? "",
        album: t.album?.["#text"] || undefined,
        imageUrl: coverOf(t.image),
        playedAt: t.date?.uts,
        nowPlaying: t["@attr"]?.nowplaying === "true",
        loved: t.loved === "1",
        url: t.url,
      }));
    },

    /** Wie oft gehört und ob „geliebt“ – null, wenn Last.fm den Song nicht kennt. */
    async trackStats(artist: string, title: string, signal?: AbortSignal) {
      try {
        const r = trackInfoSchema.parse(
          await call({ method: "track.getinfo", artist, track: title, username: cfg.user, autocorrect: "1" }, signal),
        );
        return { plays: r.track.userplaycount ?? 0, loved: r.track.userloved === "1" };
      } catch (e) {
        if (e instanceof LastfmError && e.code === 6) return null; // nicht gefunden
        throw e;
      }
    },

    /** Ähnliche Künstler (beste zuerst); leer, wenn Last.fm den Künstler nicht kennt */
    async similarArtists(artist: string, limit = 8, signal?: AbortSignal): Promise<string[]> {
      try {
        const r = similarSchema.parse(
          await call({ method: "artist.getsimilar", artist, limit: String(limit), autocorrect: "1" }, signal),
        );
        return r.similarartists.artist.filter((a) => a.match >= MIN_SIMILAR_MATCH && a.name.trim()).map((a) => a.name);
      } catch (e) {
        if (e instanceof LastfmError && e.code === 6) return [];
        throw e;
      }
    },

    async artistStats(artist: string, signal?: AbortSignal) {
      try {
        const r = artistInfoSchema.parse(
          await call({ method: "artist.getinfo", artist, username: cfg.user, autocorrect: "1" }, signal),
        );
        const tags = r.artist.tags?.tag;
        return {
          plays: r.artist.stats?.userplaycount ?? 0,
          tags: (Array.isArray(tags) ? tags : tags ? [tags] : []).map((t) => t.name).slice(0, 5),
        };
      } catch (e) {
        if (e instanceof LastfmError && e.code === 6) return null;
        throw e;
      }
    },
  };
}
