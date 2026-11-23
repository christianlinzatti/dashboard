"use client";

/* eslint-disable @next/next/no-img-element -- externes Canvas-Medium von Spotify, kein next/image */
import type { Canvas } from "./useCanvas";

/**
 * Spotify Canvas als Vollbild-Hintergrund statt der 3D-Bühne: das stumme Loop-Video (oder Bild/GIF) des Künstlers,
 * leicht abgedunkelt, damit Titel und Lyrics darüber lesbar bleiben. Bricht das Laden, bleibt der Hintergrund dunkel.
 */
export function CanvasBackground({ canvas }: { canvas: Canvas }) {
  return (
    <div className="absolute inset-0 bg-black" data-testid="canvas-background" data-kind={canvas.kind}>
      {canvas.kind === "video" ? (
        <video
          key={canvas.url}
          src={canvas.url}
          className="h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          disablePictureInPicture
        />
      ) : (
        <img key={canvas.url} src={canvas.url} alt="" className="h-full w-full object-cover" />
      )}
    </div>
  );
}
