"use client";

import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { LogEntry } from "@/lib/live/log-schema";
import { perf } from "@/lib/stage/perf";
import { songContext } from "@/lib/song-context/store";

/** Zeigt den kompletten Song-Kontext (mit ?debug=1). */
export function DebugPanel() {
  const [snap, setSnap] = useState("");
  const fps = useStore(perf, (s) => s.fps);
  const quality = useStore(perf, (s) => s.quality);
  const [log, setLog] = useState<LogEntry[] | null>(null);

  // Kiosk-Protokoll (nur angemeldet; in Demos ohne Anmeldung bleibt es aus)
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/log")
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { entries: LogEntry[] } | null) => alive && d && setLog(d.entries.slice(-8).reverse()))
        .catch(() => undefined);
    void load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

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
      <p className="mb-2 font-sans text-sm text-white" data-testid="debug-fps">
        Bildrate: {fps === null ? "–" : `${fps} fps`}
        {quality ? ` · Qualität ${quality}` : ""}
      </p>
      {log && (
        <section className="mb-2" data-testid="debug-log">
          <h2 className="font-sans text-sm font-bold text-white">Protokoll</h2>
          {log.length === 0 ? (
            <p className="text-white/50">keine Meldungen</p>
          ) : (
            <ul>
              {log.map((e, i) => (
                <li key={i} className={e.level === "fehler" ? "text-red-300" : e.level === "warnung" ? "text-amber-300" : ""}>
                  {new Date(e.at).toLocaleString("de-AT")} · {e.source}: {e.message}
                  {e.count > 1 ? ` (×${e.count})` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <h2 className="mb-2 font-sans text-sm font-bold text-white">Song-Kontext</h2>
      <pre className="whitespace-pre-wrap break-all">{snap}</pre>
    </aside>
  );
}
