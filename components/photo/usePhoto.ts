"use client";

import { useEffect } from "react";
import { composePhoto, photoDate } from "@/lib/photo/compose";
import { photoStore } from "@/lib/photo/store";
import { songContext } from "@/lib/song-context/store";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Bild nicht lesbar"));
    img.src = src;
  });
}

const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG"))), "image/jpeg", 0.85));

/**
 * Nach der Aufnahme: Bild mit Titel, Künstler, aktueller Songzeile und Datum zusammensetzen und hochladen (in Demos
 * nicht – dort bleibt es bei der Vorschau). Das Ergebnis steht im photoStore (Vorschau, Adresse für den QR-Code).
 */
export function usePhoto(upload: boolean) {
  useEffect(
    () =>
      photoStore.subscribe(async (s, prev) => {
        if (s.phase !== "hochladen" || prev.phase === "hochladen" || !s.raw) return;
        try {
          const { song, derived } = songContext.getState();
          const line = derived.lineActive && song?.lyrics ? song.lyrics.lines[derived.lineIdx]?.text : undefined;
          const canvas = composePhoto(await loadImage(s.raw), {
            title: song?.track.title ?? "",
            artist: song?.artists.map((a) => a.name).join(", ") ?? "",
            line,
            date: photoDate(Date.now()),
          });
          const blob = await toBlob(canvas);
          const preview = canvas.toDataURL("image/jpeg", 0.6);
          if (!upload) return photoStore.getState().done(preview, null);
          const res = await fetch("/api/photo", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
          if (!res.ok) throw new Error(res.status === 401 ? "Nicht angemeldet" : `Hochladen fehlgeschlagen (${res.status})`);
          const { id } = (await res.json()) as { id: string };
          photoStore.getState().done(preview, id);
        } catch (e) {
          photoStore.getState().failed(e instanceof Error ? e.message : "Foto fehlgeschlagen");
        }
      }),
    [upload],
  );
}
