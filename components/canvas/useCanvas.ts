"use client";

import { useEffect, useState } from "react";
import { canvasStatus } from "@/lib/canvas-status";
import { canvasMediaPath } from "@/lib/spotify/canvas-media";
import { useSongContext } from "@/lib/song-context/store";

export type Canvas = { url: string; kind: "video" | "image" | "gif" };

/**
 * Spotify Canvas (Loop-Video/Bild) für den laufenden Track vom Server holen (nur wenn aktiviert und angemeldet).
 * Die Adresse zeigt auf /api/canvas/video (eigene Domain), nicht direkt auf Spotify.
 * Liefert null, wenn es keins gibt, Spotify ablehnt oder im Demo-Modus. Pro Track einmal geladen; das Ergebnis ist
 * an die Track-ID gebunden, damit beim Songwechsel nicht kurz das alte Canvas zu sehen ist.
 */
export function useCanvas(enabled: boolean): Canvas | null {
  const spotifyId = useSongContext((s) => s.song?.track.spotifyId);
  const [result, setResult] = useState<{ id: string; canvas: Canvas | null } | null>(null);

  useEffect(() => {
    // echte Spotify-Track-IDs sind 22 Zeichen; Demos/lokale Dateien haben keine
    if (!enabled || !spotifyId || !/^[A-Za-z0-9]{22}$/.test(spotifyId)) {
      canvasStatus.setState({ state: "aus" }, true);
      return;
    }
    let alive = true;
    canvasStatus.setState({ state: "laedt" }, true);
    fetch(`/api/canvas?track=${spotifyId}`, { cache: "no-store" })
      .then(async (r) =>
        r.ok ? ((await r.json()) as { canvas: Canvas | null; error?: string }) : { canvas: null, error: `Server ${r.status}` },
      )
      .then((d) => {
        if (!alive) return;
        // Medium über die eigene Domain laden (Content-Security-Policy, WebGL-Textur auf der Bühnen-Leinwand)
        const c = d.canvas;
        setResult({ id: spotifyId, canvas: c ? { kind: c.kind, url: canvasMediaPath(spotifyId) } : null });
        canvasStatus.setState(
          c ? { state: "da", kind: c.kind } : d.error ? { state: "fehler", error: d.error } : { state: "keins" },
          true,
        );
      })
      .catch(() => alive && canvasStatus.setState({ state: "fehler", error: "keine Verbindung zum Server" }, true));
    return () => {
      alive = false;
    };
  }, [enabled, spotifyId]);

  return result && result.id === spotifyId ? result.canvas : null;
}
