"use client";

import { useEffect, useState } from "react";
import { songContext } from "@/lib/song-context/store";

/** Zeigt den kompletten Song-Kontext (mit ?debug=1). */
export function DebugPanel() {
  const [snap, setSnap] = useState("");

  useEffect(() => {
    const read = () => {
      const { song, playback, live, derived, positionMs, frozen } = songContext.getState();
      const compact = song && {
        ...song,
        lyrics: song.lyrics && { ...song.lyrics, lines: `${song.lyrics.lines.length} Zeilen` },
      };
      setSnap(JSON.stringify({ positionMs: Math.round(positionMs), frozen, derived, playback, live, song: compact }, null, 2));
    };
    read();
    const id = setInterval(read, 250);
    return () => clearInterval(id);
  }, []);

  return (
    <aside
      className="pointer-events-none absolute right-2 top-2 z-50 max-h-[calc(100%-1rem)] w-[min(420px,45vw)] overflow-auto rounded-lg bg-black/85 p-3 font-mono text-[11px] leading-snug text-emerald-300"
      data-testid="debug-panel"
    >
      <h2 className="mb-2 font-sans text-sm font-bold text-white">Song-Kontext</h2>
      <pre className="whitespace-pre-wrap break-all">{snap}</pre>
    </aside>
  );
}
