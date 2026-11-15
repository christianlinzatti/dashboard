"use client";

import { useEffect, useState } from "react";
import { setLiked } from "@/lib/personal/like";
import { useSongContext } from "@/lib/song-context/store";

/**
 * ♥ Lieblingssong (antippen zum Entfernen) bzw. ♡ Merken (antippen zum Speichern), ♥ Last.fm, „37× gehört“.
 * Unbekannte Werte werden nicht angezeigt.
 */
export function LikeBadges() {
  const user = useSongContext((s) => s.song?.user);
  const trackKey = useSongContext((s) => s.song?.trackKey);
  const [busy, setBusy] = useState(false);
  // Fehler gehört zum Song, bei dem er auftrat – beim nächsten Song verschwindet er von selbst
  const [failure, setFailure] = useState<{ key?: string; msg: string } | null>(null);
  useEffect(() => {
    if (!failure) return;
    const t = setTimeout(() => setFailure(null), 8000);
    return () => clearTimeout(t);
  }, [failure]);
  const error = failure && failure.key === trackKey ? failure.msg : null;
  if (!user) return null;

  const chip = "rounded-full bg-white/10 px-[1.2vmin] py-[0.3vmin] text-[clamp(11px,1.8vmin,18px)] font-semibold backdrop-blur";
  const toggle = async (saved: boolean) => {
    if (busy) return;
    setBusy(true);
    const r = await setLiked(saved);
    setBusy(false);
    setFailure(r.ok ? null : { key: trackKey, msg: r.error });
  };
  // eigener Tipp-Bereich: kein Ein-/Ausblenden der Steuerleiste beim Liken
  const tap = (saved: boolean) => (e: React.MouseEvent) => {
    e.stopPropagation();
    void toggle(saved);
  };

  return (
    <div className="mt-[0.6vmin] flex flex-wrap items-center gap-[0.8vmin]" data-testid="like-badges">
      {user.trackSaved === true && (
        <button
          type="button"
          className={`${chip} min-h-[32px]`}
          title="In deinen Spotify-Lieblingssongs – antippen zum Entfernen"
          aria-pressed
          disabled={busy}
          onClick={tap(false)}
          data-testid="badge-saved"
        >
          <span style={{ color: "#1ed760" }}>♥</span> Lieblingssong
        </button>
      )}
      {user.trackSaved === false && (
        <button
          type="button"
          className={`${chip} min-h-[32px] text-white/80`}
          title="In deinen Spotify-Lieblingssongs speichern"
          aria-pressed={false}
          disabled={busy}
          onClick={tap(true)}
          data-testid="like-button"
        >
          ♡ Merken
        </button>
      )}
      {user.lovedOnLastfm && (
        <span className={chip} title="Auf Last.fm geliebt" data-testid="badge-loved">
          <span style={{ color: "#d51007" }}>♥</span> Last.fm
        </span>
      )}
      {!!user.trackPlays && (
        <span className={chip} data-testid="badge-plays">
          {user.trackPlays.toLocaleString("de-DE")}× gehört
        </span>
      )}
      {error && (
        <span className={`${chip} bg-red-600/70`} role="status" data-testid="like-error">
          {error}
        </span>
      )}
    </div>
  );
}
