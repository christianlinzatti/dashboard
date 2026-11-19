"use client";

import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import type { LogEntry } from "@/lib/live/log-schema";
import { perf } from "@/lib/stage/perf";
import { songContext } from "@/lib/song-context/store";
import { sendDebugContext } from "@/lib/live/debug-upload";
import { browserEnv, diagnose, type Finding } from "@/lib/debug/diagnose";
import type { AiTraceInfo } from "@/lib/show/trace";
import { AiTraceView, useAiTrace } from "./AiTraceView";
import { Findings } from "./Findings";

/** Song-Kontext: kompakt (Lyrics-Zeilen nur gezählt) oder vollständig */
function contextObject(full: boolean, ki?: AiTraceInfo | null) {
  const { song, playback, live, derived, positionMs, frozen } = songContext.getState();
  const shown = full
    ? song
    : song && { ...song, lyrics: song.lyrics && { ...song.lyrics, lines: `${song.lyrics.lines.length} Zeilen` } };
  // KI-Frage und -Antwort nur vollständig (Kopieren, Datei, Server) – in der laufenden Anzeige steht sie eigens
  return {
    positionMs: Math.round(positionMs),
    frozen,
    derived,
    playback,
    live,
    env: browserEnv(),
    song: shown,
    ...(full && ki ? { ki } : {}),
  };
}

/** Im Live-Modus so oft an den Server senden */
const LIVE_SEND_MS = 10_000;

function fileName() {
  const key = songContext.getState().song?.trackKey ?? "kein-song";
  return `song-kontext-${key.replace(/[^\w-]+/g, "_").slice(0, 60)}.json`;
}

/**
 * Zeigt den kompletten Song-Kontext (mit ?debug=1). Scrollbar und markierbar; „Anhalten“ friert die Anzeige ein
 * (sonst geht beim Aktualisieren die Markierung verloren), dazu Kopieren, als Datei speichern, im eigenen Tab öffnen
 * (vollständig, mit allen Lyrics-Zeilen), Vollbild und an den Server senden (einmal oder „Live“ alle 10 s) – ansehen
 * dann auf jedem angemeldeten Gerät unter /debug.
 */
export function DebugPanel() {
  const [snap, setSnap] = useState("");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [paused, setPaused] = useState(false);
  const [big, setBig] = useState(false);
  const [note, setNote] = useState("");
  const [liveSend, setLiveSend] = useState(false);
  const pre = useRef<HTMLPreElement>(null);
  const fps = useStore(perf, (s) => s.fps);
  const quality = useStore(perf, (s) => s.quality);
  const [log, setLog] = useState<LogEntry[] | null>(null);
  const ki = useAiTrace();
  const kiRef = useRef(ki);
  useEffect(() => {
    kiRef.current = ki;
  }, [ki]);
  const contextJson = (full: boolean) => JSON.stringify(contextObject(full, ki), null, 2);

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
    if (paused) return;
    const read = () => {
      const ctx = contextObject(false);
      setSnap(JSON.stringify(ctx, null, 2));
      setFindings(diagnose(ctx as Parameters<typeof diagnose>[0]));
    };
    read();
    const id = setInterval(read, 250);
    return () => clearInterval(id);
  }, [paused]);

  // Live: alle 10 s an den Server (zum Mitlesen auf einem anderen Gerät unter /debug)
  useEffect(() => {
    if (!liveSend) return;
    const send = () => void sendDebugContext(contextObject(true, kiRef.current)).then((m) => setNote(m));
    send();
    const id = setInterval(send, LIVE_SEND_MS);
    return () => clearInterval(id);
  }, [liveSend]);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash("Kopiert ✓");
    } catch {
      flash("Kopieren nicht erlaubt – Text markieren und kopieren");
    }
  };

  const flash = (text: string) => {
    setNote(text);
    setTimeout(() => setNote(""), 2500);
  };

  const copy = async () => {
    const text = contextJson(true);
    try {
      await navigator.clipboard.writeText(text);
      flash("Kopiert ✓");
    } catch {
      // ohne Zwischenablage-Recht (z. B. http im Heimnetz): Text markieren, dann Strg+C / lange drücken
      setPaused(true);
      const el = pre.current;
      if (el) window.getSelection()?.selectAllChildren(el);
      flash("Markiert – jetzt Strg+C bzw. „Kopieren“ im Menü");
    }
  };

  const blobUrl = () => URL.createObjectURL(new Blob([contextJson(true)], { type: "application/json" }));

  const download = () => {
    const url = blobUrl();
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    flash("Datei gespeichert ✓");
  };

  const openTab = () => {
    const url = blobUrl();
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const button =
    "rounded-md bg-white/15 px-2 py-1 font-sans text-xs font-semibold text-white hover:bg-white/25 active:bg-white/35";

  return (
    <aside
      className={`pointer-events-auto absolute z-50 select-text overflow-auto overscroll-contain rounded-lg bg-black/95 p-3 font-mono text-[11px] leading-snug text-emerald-300 ${
        big ? "inset-2" : "right-2 top-2 max-h-[calc(100%-1rem)] w-[min(420px,45vw)]"
      }`}
      style={{ touchAction: "pan-y" }}
      // Tippen ins Panel soll nicht die Steuerleiste des Dashboards auslösen
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="debug-panel"
      data-paused={paused}
    >
      <div className="sticky top-0 -mx-3 -mt-3 mb-2 flex flex-wrap items-center gap-1.5 bg-black/95 px-3 py-2">
        <button type="button" className={button} onClick={() => setPaused((p) => !p)} data-testid="debug-pause">
          {paused ? "Weiter" : "Anhalten"}
        </button>
        <button type="button" className={button} onClick={() => void copy()} data-testid="debug-copy">
          Kopieren
        </button>
        <button type="button" className={button} onClick={download} data-testid="debug-download">
          Datei
        </button>
        <button type="button" className={button} onClick={openTab} data-testid="debug-tab">
          Neuer Tab
        </button>
        <button
          type="button"
          className={button}
          onClick={() => void sendDebugContext(contextObject(true, ki)).then(flash)}
          data-testid="debug-send"
        >
          An Server
        </button>
        <button
          type="button"
          className={`${button} ${liveSend ? "bg-emerald-500/60" : ""}`}
          onClick={() => setLiveSend((l) => !l)}
          aria-pressed={liveSend}
          data-testid="debug-live"
        >
          {liveSend ? "Live an" : "Live"}
        </button>
        <button type="button" className={button} onClick={() => setBig((b) => !b)} data-testid="debug-size">
          {big ? "Klein" : "Groß"}
        </button>
        {note && (
          <span className="font-sans text-xs text-white" role="status">
            {note}
          </span>
        )}
      </div>
      <p className="mb-2 font-sans text-sm text-white" data-testid="debug-fps">
        Bildrate: {fps === null ? "–" : `${fps} fps`}
        {quality ? ` · Qualität ${quality}` : ""}
      </p>
      {log && (
        <section className="mb-2" data-testid="debug-log">
          <div className="flex items-center gap-2">
            <h2 className="font-sans text-sm font-bold text-white">Protokoll</h2>
            {log.length > 0 && (
              <button
                type="button"
                className={button}
                onClick={() =>
                  void fetch("/api/log", { method: "DELETE" }).then((r) => {
                    if (r.ok) setLog([]);
                    flash(r.ok ? "Protokoll geleert ✓" : "Leeren fehlgeschlagen");
                  })
                }
                data-testid="debug-log-clear"
              >
                Leeren
              </button>
            )}
          </div>
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
      <h2 className="mb-1 font-sans text-sm font-bold text-white">Kurzdiagnose</h2>
      <div className="mb-3">
        <Findings items={findings} />
      </div>
      <h2 className="mb-1 font-sans text-sm font-bold text-white">KI-Regie: Frage und Antwort</h2>
      <div className="mb-3">
        <AiTraceView info={ki} onCopy={(t) => void copyText(t)} />
      </div>
      <h2 className="mb-2 font-sans text-sm font-bold text-white">Song-Kontext</h2>
      <pre ref={pre} className="whitespace-pre-wrap break-all">
        {snap}
      </pre>
    </aside>
  );
}
