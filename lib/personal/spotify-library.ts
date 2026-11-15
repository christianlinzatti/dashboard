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

type CallInit = (path: string, init?: RequestInit) => Promise<Response>;

/**
 * Song in den Lieblingssongs speichern bzw. entfernen. Neuer Bibliotheks-Endpunkt (PUT/DELETE /me/library?uris=…),
 * Rückfall auf /me/tracks?ids=…. Liefert true bei Erfolg, „scope“ wenn die Berechtigung fehlt.
 */
export async function saveTrack(call: CallInit, trackId: string, saved: boolean): Promise<true | "scope" | false> {
  if (!/^[A-Za-z0-9]{10,}$/.test(trackId)) return false;
  const method = saved ? "PUT" : "DELETE";
  const paths = [
    `/me/library?uris=${encodeURIComponent(`spotify:track:${trackId}`)}`,
    `/me/tracks?ids=${encodeURIComponent(trackId)}`,
  ];
  let scope = false;
  for (const p of paths) {
    const res = await call(p, { method }).catch(() => null);
    if (!res) continue;
    if (res.ok) return true;
    if (res.status === 403 || res.status === 401) scope = true;
  }
  return scope ? "scope" : false;
}
