import "server-only";

/**
 * Spotify-Bibliothek: Song gespeichert? Künstler gefolgt?
 * Spotify hat im Feb. 2026 Bibliotheks-Endpunkte für Apps im Entwicklungsmodus umgestellt
 * (u. a. PUT /me/tracks → PUT /me/library). Wir versuchen den neuen Endpunkt und fallen auf den
 * alten zurück; liefert keiner eine Antwort, bleibt der Wert unbekannt (Anzeige entfällt).
 */
type Call = (path: string) => Promise<Response>;

async function firstBooleans(call: Call, paths: string[], count: number): Promise<boolean[] | null> {
  for (const p of paths) {
    const res = await call(p).catch(() => null);
    if (!res) continue;
    if (res.status === 404 || res.status === 410 || res.status === 403 || res.status === 400) continue;
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    if (Array.isArray(body) && body.length === count && body.every((b) => typeof b === "boolean")) return body;
  }
  return null;
}

export async function trackSaved(call: Call, trackId: string): Promise<boolean | undefined> {
  const r = await firstBooleans(
    call,
    [
      `/me/library/contains?uris=${encodeURIComponent(`spotify:track:${trackId}`)}`,
      `/me/tracks/contains?ids=${encodeURIComponent(trackId)}`,
    ],
    1,
  );
  return r?.[0];
}

export async function artistsFollowed(call: Call, artistIds: string[]): Promise<Record<string, boolean>> {
  const ids = artistIds.filter((id) => /^[A-Za-z0-9]{10,}$/.test(id)).slice(0, 50);
  if (!ids.length) return {};
  const r = await firstBooleans(
    call,
    [
      `/me/library/contains?uris=${encodeURIComponent(ids.map((i) => `spotify:artist:${i}`).join(","))}`,
      `/me/following/contains?type=artist&ids=${encodeURIComponent(ids.join(","))}`,
    ],
    ids.length,
  );
  return r ? Object.fromEntries(ids.map((id, i) => [id, r[i]!])) : {};
}
