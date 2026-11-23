"use client";

import { useEffect, useState } from "react";
import { useSongContext } from "@/lib/song-context/store";

export type Canvas = { url: string; kind: "video" | "image" | "gif" };

/**
 * Spotify Canvas (Loop-Video/Bild) für den laufenden Track vom Server holen (nur wenn aktiviert und angemeldet).
 * Liefert null, wenn es keins gibt, Spotify ablehnt oder im Demo-Modus. Pro Track einmal geladen; das Ergebnis ist
 * an die Track-ID gebunden, damit beim Songwechsel nicht kurz das alte Canvas zu sehen ist.
 */
export function useCanvas(enabled: boolean): Canvas | null {
  const spotifyId = useSongContext((s) => s.song?.track.spotifyId);
  const [result, setResult] = useState<{ id: string; canvas: Canvas | null } | null>(null);

  useEffect(() => {
    // echte Spotify-Track-IDs sind 22 Zeichen; Demos/lokale Dateien haben keine
    if (!enabled || !spotifyId || !/^[A-Za-z0-9]{22}$/.test(spotifyId)) return;
    let alive = true;
    fetch(`/api/canvas?track=${spotifyId}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ canvas: Canvas | null }>) : null))
      .then((d) => {
        if (alive) setResult({ id: spotifyId, canvas: d?.canvas ?? null });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [enabled, spotifyId]);

  return result && result.id === spotifyId ? result.canvas : null;
}
