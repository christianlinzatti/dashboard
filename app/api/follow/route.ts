import { z } from "zod";
import { followArtist } from "@/lib/personal/spotify-library";
import { json, withSpotify } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";
const body = z.object({ artistId: z.string().regex(/^[A-Za-z0-9]{10,40}$/), follow: z.boolean() });

/** Einem Künstler auf Spotify folgen oder entfolgen. */
export async function POST(req: Request) {
  const b = body.safeParse(await req.json().catch(() => null));
  if (!b.success) return json({ error: "Ungültige Anfrage." }, 400);
  return withSpotify(async (call) => {
    const r = await followArtist(call, b.data.artistId, b.data.follow);
    if (r === true) return json({ ok: true, following: b.data.follow });
    // Anmeldungen vor dieser Funktion haben die Berechtigung zum Folgen noch nicht
    if (r === "scope") return json({ error: "Bitte einmal neu anmelden, um Künstlern zu folgen.", reauth: true }, 403);
    return json({ error: "Spotify hat das Folgen nicht übernommen." }, 502);
  });
}
