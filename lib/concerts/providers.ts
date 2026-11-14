import { z } from "zod";
import { normalizeLine } from "@/lib/lyrics/text";
import type { Setlist } from "@/lib/song-context/schema";
import type { ConcertProvider, RawEvent } from "./types";

type Http = (url: string, init?: RequestInit) => Promise<Response>;
const same = (a: string, b: string) => normalizeLine(a) === normalizeLine(b);
const coord = z
  .union([z.number(), z.string()])
  .transform((v) => Number(v))
  .optional();

// --- Ticketmaster Discovery API v2 (kostenloser Key) ---
const tmSchema = z.object({
  _embedded: z
    .object({
      events: z.array(
        z.object({
          name: z.string(),
          url: z.string().optional(),
          dates: z.object({
            start: z.object({ localDate: z.string().optional(), localTime: z.string().optional() }),
            status: z.object({ code: z.string() }).optional(),
          }),
          _embedded: z
            .object({
              venues: z
                .array(
                  z.object({
                    name: z.string().optional(),
                    city: z.object({ name: z.string() }).optional(),
                    country: z.object({ countryCode: z.string() }).optional(),
                    location: z.object({ latitude: coord, longitude: coord }).optional(),
                  }),
                )
                .optional(),
              attractions: z.array(z.object({ name: z.string() })).optional(),
            })
            .optional(),
        }),
      ),
    })
    .optional(),
});

export function ticketmaster(apiKey: string, http: Http = fetch): ConcertProvider {
  return {
    id: "ticketmaster",
    ticketPriority: 2,
    async events(artist, signal) {
      const q = new URLSearchParams({
        apikey: apiKey,
        keyword: artist,
        classificationName: "music",
        size: "50",
        sort: "date,asc",
      });
      const res = await http(`https://app.ticketmaster.com/discovery/v2/events.json?${q}`, { signal });
      if (!res.ok) throw new Error(`Ticketmaster ${res.status}`);
      const body = tmSchema.parse(await res.json());
      return (body._embedded?.events ?? []).flatMap((e): RawEvent[] => {
        // nur Termine, bei denen der Künstler wirklich auftritt (Stichwortsuche liefert auch Tribute-Shows)
        if (!e._embedded?.attractions?.some((a) => same(a.name, artist))) return [];
        const v = e._embedded.venues?.[0];
        if (!e.dates.start.localDate || !v?.city) return [];
        return [
          {
            provider: "ticketmaster",
            artistName: artist,
            date: e.dates.start.localDate,
            time: e.dates.start.localTime?.slice(0, 5),
            venue: v.name ?? "",
            city: v.city.name,
            country: v.country?.countryCode,
            lat: v.location?.latitude,
            lon: v.location?.longitude,
            ticketUrl: e.url,
            cancelled: e.dates.status?.code === "cancelled",
          },
        ];
      });
    },
  };
}

// --- Bandsintown (App-ID, Quellenangabe erforderlich) ---
const bitSchema = z.array(
  z.object({
    url: z.string().optional(),
    datetime: z.string(),
    venue: z.object({
      name: z.string().optional(),
      city: z.string(),
      country: z.string().optional(),
      latitude: coord,
      longitude: coord,
    }),
    offers: z
      .array(z.object({ type: z.string().optional(), url: z.string().optional(), status: z.string().optional() }))
      .default([]),
    lineup: z.array(z.string()).default([]),
  }),
);

export function bandsintown(appId: string, http: Http = fetch): ConcertProvider {
  return {
    id: "bandsintown",
    ticketPriority: 3,
    async events(artist, signal) {
      const res = await http(
        `https://rest.bandsintown.com/artists/${encodeURIComponent(artist)}/events?${new URLSearchParams({ app_id: appId, date: "upcoming" })}`,
        {
          signal,
        },
      );
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`Bandsintown ${res.status}`);
      const parsed = bitSchema.safeParse(await res.json().catch(() => null));
      if (!parsed.success) return []; // unbekannter Künstler → {errorMessage} oder leer
      return parsed.data
        .filter((e) => !e.lineup.length || e.lineup.some((n) => same(n, artist)))
        .map((e) => {
          const tickets = e.offers.find((o) => o.type?.toLowerCase() === "tickets") ?? e.offers[0];
          return {
            provider: "bandsintown",
            artistName: artist,
            date: e.datetime.slice(0, 10),
            time: e.datetime.slice(11, 16) || undefined,
            venue: e.venue.name ?? "",
            city: e.venue.city,
            country: e.venue.country,
            lat: e.venue.latitude,
            lon: e.venue.longitude,
            ticketUrl: tickets?.url ?? e.url,
            soldOut: tickets?.status?.toLowerCase() === "sold out",
          };
        });
    },
  };
}

// --- setlist.fm: zuletzt live gespielte Songs (keine Zukunftstermine) ---
const setlistSchema = z.object({
  setlist: z
    .array(
      z.object({
        eventDate: z.string(),
        artist: z.object({ name: z.string() }),
        venue: z.object({ name: z.string().optional(), city: z.object({ name: z.string() }).optional() }).optional(),
        tour: z.object({ name: z.string() }).optional(),
        sets: z
          .object({ set: z.array(z.object({ song: z.array(z.object({ name: z.string() })).default([]) })).default([]) })
          .optional(),
      }),
    )
    .default([]),
});

export type LastSetlist = Setlist;

export async function lastSetlist(
  apiKey: string,
  artist: string,
  http: Http = fetch,
  signal?: AbortSignal,
): Promise<LastSetlist | null> {
  const res = await http(
    `https://api.setlist.fm/rest/1.0/search/setlists?${new URLSearchParams({ artistName: artist, p: "1" })}`,
    {
      headers: { "x-api-key": apiKey, Accept: "application/json" },
      signal,
    },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`setlist.fm ${res.status}`);
  const sl = setlistSchema
    .parse(await res.json())
    .setlist.find((s) => same(s.artist.name, artist) && (s.sets?.set.some((x) => x.song.length) ?? false));
  if (!sl) return null;
  const [d, m, y] = sl.eventDate.split("-");
  return {
    date: `${y}-${m}-${d}`,
    city: sl.venue?.city?.name,
    tour: sl.tour?.name,
    songs: (sl.sets?.set ?? []).flatMap((s) => s.song.map((x) => x.name)).filter(Boolean),
  };
}
