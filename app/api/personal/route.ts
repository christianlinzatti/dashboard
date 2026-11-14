import type { NextRequest } from "next/server";
import { z } from "zod";
import { lastfmFromEnv, userInfoFor } from "@/lib/personal/service";
import { json, withSpotify } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";
const SEP = "\u001f";
const query = z.object({
  trackId: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  ids: z.string().min(1).max(1000),
  names: z.string().min(1).max(1500),
});

/** Likes, Follows und Hörstatistik zum aktuellen Song. */
export async function GET(req: NextRequest) {
  const q = query.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return json({ error: "Ungültige Anfrage." }, 400);
  const ids = q.data.ids.split(SEP);
  const names = q.data.names.split(SEP);
  return withSpotify(async (call) =>
    json({
      user: await userInfoFor(
        { trackId: q.data.trackId, title: q.data.title, artists: ids.map((id, i) => ({ id, name: names[i] ?? "" })) },
        { spotify: (p) => call(p), lastfm: lastfmFromEnv() },
      ),
    }),
  );
}
