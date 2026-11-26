import type { NextRequest } from "next/server";
import { z } from "zod";
import { AUDIODB_TEST_KEY } from "@/lib/info/theaudiodb";
import { getCache } from "@/lib/lyrics/cache";
import { json, withSpotify } from "@/lib/server/spotify-route";
import { artistMetaFor } from "@/lib/spotify/artist-meta";

export const dynamic = "force-dynamic";
const SEP = "\u001f";
const query = z.object({ ids: z.string().min(1).max(500), names: z.string().min(1).max(1500) });

/** Genres und Bilder der Künstler (Spotify, sonst Last.fm/TheAudioDB; 7 Tage gemerkt) – für Figurenwahl und Anzeige */
export async function GET(req: NextRequest) {
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return json({ error: "Ungültige Anfrage." }, 400);
  const ids = q.data.ids.split(SEP);
  const names = q.data.names.split(SEP);
  return withSpotify(async (call) =>
    json({
      artists: await artistMetaFor(
        ids.map((id, i) => ({ id, name: names[i] ?? "" })).filter((a) => a.name),
        {
          cache: getCache(),
          call,
          http: (url, signal) => fetch(url, { signal, headers: { "User-Agent": "sonic-stage/1.0" } }),
          audioDbKey: process.env.THEAUDIODB_API_KEY || AUDIODB_TEST_KEY,
          lastfmKey: process.env.LASTFM_API_KEY || undefined,
          signal: AbortSignal.timeout(6000),
        },
      ),
    }),
  );
}
