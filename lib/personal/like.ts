import { songContext } from "@/lib/song-context/store";

export type LikeResult = { ok: true } | { ok: false; error: string; reauth?: boolean };

/**
 * Aktuellen Song merken bzw. entfernen: sofort anzeigen, bei Fehler zurücknehmen.
 * Wird vom Herz in der Kopfzeile und von Alexa-Befehlen genutzt.
 */
export async function setLiked(saved: boolean, fetchImpl: typeof fetch = fetch): Promise<LikeResult> {
  const { song, mergeSong } = songContext.getState();
  if (!song) return { ok: false, error: "Kein Song aktiv." };
  const before = song.user;
  const key = song.trackKey;
  mergeSong({ user: { ...(before ?? { artists: {} }), trackSaved: saved } });
  try {
    const res = await fetchImpl("/api/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId: song.track.spotifyId, saved }),
    });
    if (res.ok) return { ok: true };
    const b = (await res.json().catch(() => ({}))) as { error?: string; reauth?: boolean };
    throw Object.assign(new Error(b.error ?? `Fehler ${res.status}`), { reauth: b.reauth });
  } catch (e) {
    // nur zurücknehmen, wenn noch derselbe Song läuft
    if (songContext.getState().song?.trackKey === key) songContext.getState().mergeSong({ user: before });
    return { ok: false, error: (e as Error).message || "Speichern fehlgeschlagen.", reauth: (e as { reauth?: boolean }).reauth };
  }
}
