import { z } from "zod";
import { saveTrack } from "@/lib/personal/spotify-library";
import { json, withSpotify } from "@/lib/server/spotify-route";

export const dynamic = "force-dynamic";
const body = z.object({ trackId: z.string().regex(/^[A-Za-z0-9]{10,40}$/), saved: z.boolean() });

/** Song in den Spotify-Lieblingssongs speichern oder entfernen. */
export async function POST(req: Request) {
  const b = body.safeParse(await req.json().catch(() => null));
  if (!b.success) return json({ error: "Ungültige Anfrage." }, 400);
  return withSpotify(async (call, session) => {
    // Anmeldungen vor dieser Funktion haben die Schreib-Berechtigung noch nicht
    if (!session.scope.split(" ").includes("user-library-modify"))
      return json({ error: "Bitte einmal neu anmelden, um Songs zu speichern.", reauth: true }, 403);
    const r = await saveTrack(call, b.data.trackId, b.data.saved);
    if (r === true) return json({ ok: true, saved: b.data.saved });
    if (r === "scope") return json({ error: "Spotify erlaubt das Speichern für diese App nicht.", reauth: true }, 403);
    return json({ error: "Spotify hat den Song nicht gespeichert." }, 502);
  });
}
