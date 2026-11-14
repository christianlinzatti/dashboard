import { json, withSpotify } from "@/lib/server/spotify-route";

const actions = {
  play: { method: "PUT", path: "/me/player/play" },
  pause: { method: "PUT", path: "/me/player/pause" },
  next: { method: "POST", path: "/me/player/next" },
  previous: { method: "POST", path: "/me/player/previous" },
} as const;

/** Player-Steuerung. Im Spotify-Entwicklungsmodus kann Schreibzugriff gesperrt sein → 403 sauber melden. */
export async function POST(_req: Request, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  const a = actions[action as keyof typeof actions];
  if (!a) return json({ error: "Unbekannte Aktion" }, 404);

  return withSpotify(async (call) => {
    const res = await call(a.path, { method: a.method });
    if (res.ok || res.status === 204) return json({ ok: true });
    if (res.status === 403) return json({ error: "Spotify erlaubt diese Steuerung für die App nicht." }, 403);
    if (res.status === 404) return json({ error: "Kein aktives Spotify-Gerät." }, 404);
    return json({ error: `Spotify antwortet mit ${res.status}` }, 502);
  });
}
