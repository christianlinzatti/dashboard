import { songContext } from "@/lib/song-context/store";
import type { LikeResult } from "./like";

/** Künstler des laufenden Songs folgen bzw. entfolgen: sofort anzeigen, bei Fehler zurücknehmen. */
export async function setFollowing(artistId: string, follow: boolean, fetchImpl: typeof fetch = fetch): Promise<LikeResult> {
  const { song, mergeSong } = songContext.getState();
  if (!song) return { ok: false, error: "Kein Song aktiv." };
  const before = song.user;
  const key = song.trackKey;
  const base = before ?? { artists: {} };
  mergeSong({
    user: { ...base, artists: { ...base.artists, [artistId]: { ...base.artists[artistId], following: follow } } },
  });
  try {
    const res = await fetchImpl("/api/follow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artistId, follow }),
    });
    if (res.ok) return { ok: true };
    const b = (await res.json().catch(() => ({}))) as { error?: string; reauth?: boolean };
    throw Object.assign(new Error(b.error ?? `Fehler ${res.status}`), { reauth: b.reauth });
  } catch (e) {
    // nur zurücknehmen, wenn noch derselbe Song läuft
    if (songContext.getState().song?.trackKey === key) songContext.getState().mergeSong({ user: before });
    return { ok: false, error: (e as Error).message || "Folgen fehlgeschlagen.", reauth: (e as { reauth?: boolean }).reauth };
  }
}
