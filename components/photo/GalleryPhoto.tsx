"use client";

import { useState } from "react";

/** Ein Foto der Galerie mit Speichern-Knopf; abgelaufene Fotos (nach 24 h) verschwinden still */
export function GalleryPhoto({ id, n }: { id: string; n: number }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const src = `/api/photo/${id}`;
  return (
    <li className="flex flex-col items-center gap-2" data-testid="gallery-photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- Foto aus dem eigenen Speicher */}
      <img src={src} alt={`Foto ${n}`} className="w-full rounded-xl shadow-2xl" onError={() => setGone(true)} loading="lazy" />
      <a
        href={src}
        download={`sonic-stage-${n}-${id.slice(0, 6)}.jpg`}
        className="rounded-full bg-fuchsia-600 px-5 py-2 text-sm font-bold"
      >
        Foto {n} speichern
      </a>
    </li>
  );
}
