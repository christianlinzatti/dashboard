"use client";

import { useCallback, useEffect, useState } from "react";
import type { DebugEntry } from "@/lib/live/debug-upload";
import type { LogEntry } from "@/lib/live/log-schema";
import { diagnose } from "@/lib/debug/diagnose";
import { Findings } from "./Findings";
import { AiTraceView, parseTraceInfo } from "./AiTraceView";
import { LyricsStatus } from "./LyricsStatus";
import { PerfHistory } from "./PerfHistory";

type State = { kind: "laden" } | { kind: "login" } | { kind: "fehler"; text: string } | { kind: "ok"; entry: DebugEntry | null };

function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `vor ${s} s` : s < 3600 ? `vor ${Math.round(s / 60)} min` : `vor ${Math.round(s / 3600)} h`;
}

/**
 * Song-Kontext auf einem anderen Gerät ansehen: zeigt, was das Debug-Panel des Dashboards zuletzt an den Server
 * geschickt hat (gleiches Spotify-Konto). Abschnitte aufklappbar, alles markier- und kopierbar, als Datei speicherbar;
 * auf Wunsch alle 5 s neu laden. Darunter das Kiosk-Protokoll (7 Tage, mit „Leeren“).
 */
export function DebugViewer() {
  const [state, setState] = useState<State>({ kind: "laden" });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [auto, setAuto] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/debug-context", { cache: "no-store" });
      if (res.status === 401) return setState({ kind: "login" });
      if (!res.ok) return setState({ kind: "fehler", text: `Server antwortet mit ${res.status}` });
      const { entry } = (await res.json()) as { entry: DebugEntry | null };
      setState({ kind: "ok", entry });
      const l = await fetch("/api/log", { cache: "no-store" });
      if (l.ok) setLog(((await l.json()) as { entries: LogEntry[] }).entries.slice(-30).reverse());
    } catch {
      setState({ kind: "fehler", text: "Keine Verbindung zum Server" });
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    if (!auto) return () => clearTimeout(first);
    const id = setInterval(() => void load(), 5000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [auto, load]);

  const entry = state.kind === "ok" ? state.entry : null;
  const text = entry ? JSON.stringify(entry.context, null, 2) : "";
  const flash = (t: string) => {
    setNote(t);
    setTimeout(() => setNote(""), 2500);
  };
  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      flash("Kopiert ✓");
    } catch {
      flash("Kopieren nicht erlaubt – Text markieren und kopieren");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `song-kontext-${new Date(entry?.receivedAt ?? Date.now()).toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  const button = "rounded-md bg-white/15 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25 active:bg-white/35";

  return (
    <main className="fixed inset-0 overflow-auto bg-[#05030a] text-white" data-testid="debug-viewer" data-state={state.kind}>
      <div className="mx-auto max-w-5xl p-4">
        <h1 className="text-xl font-bold">Song-Kontext vom Dashboard</h1>
        <p className="mt-1 text-sm text-white/60">
          Im Dashboard mit <code>?debug=1</code> öffnen und im Debug-Panel „An Server“ (einmal) oder „Live“ (alle 10 s) tippen.
          Gilt für dein Spotify-Konto und bleibt eine Stunde gespeichert.
        </p>

        <div className="sticky top-0 z-10 -mx-4 mt-3 flex flex-wrap items-center gap-2 bg-[#05030a]/95 px-4 py-2">
          <button type="button" className={button} onClick={() => void load()} data-testid="viewer-reload">
            Neu laden
          </button>
          <button
            type="button"
            className={`${button} ${auto ? "bg-emerald-600/70" : ""}`}
            onClick={() => setAuto((a) => !a)}
            aria-pressed={auto}
          >
            {auto ? "Automatisch an (5 s)" : "Automatisch"}
          </button>
          {entry && (
            <>
              <button type="button" className={button} onClick={() => void copy(text)} data-testid="viewer-copy">
                Alles kopieren
              </button>
              <button type="button" className={button} onClick={download}>
                Datei
              </button>
              <span className="text-sm text-white/60" data-testid="viewer-age">
                gesendet {ago(entry.receivedAt)}
                {entry.device ? ` · Bildschirm ${entry.device}` : ""}
              </span>
            </>
          )}
          {note && (
            <span className="text-sm" role="status">
              {note}
            </span>
          )}
        </div>

        {state.kind === "laden" && <p className="mt-6 text-white/60">Lade …</p>}
        {state.kind === "login" && (
          <p className="mt-6" data-testid="viewer-login">
            Nicht angemeldet.{" "}
            <a className="font-semibold text-emerald-300 underline" href="/api/auth/login">
              Mit Spotify anmelden
            </a>{" "}
            (mit demselben Konto wie das Dashboard).
          </p>
        )}
        {state.kind === "fehler" && <p className="mt-6 text-red-300">{state.text}</p>}

        {state.kind !== "login" && <LyricsStatus auto={auto} />}
        {state.kind !== "login" && <PerfHistory auto={auto} />}
        {state.kind === "ok" && !entry && (
          <p className="mt-6 text-white/70" data-testid="viewer-empty">
            Noch nichts gesendet (oder älter als eine Stunde).
          </p>
        )}

        {entry && (
          <section className="mt-4 rounded-lg bg-white/5 p-3">
            <h2 className="mb-2 text-sm font-bold">Kurzdiagnose</h2>
            <Findings items={diagnose(entry.context as Parameters<typeof diagnose>[0])} />
          </section>
        )}

        {entry && "ki" in entry.context && (
          <section className="mt-4 rounded-lg bg-white/5 p-3" data-testid="viewer-ai">
            <h2 className="mb-2 text-sm font-bold">KI-Regie: Frage und Antwort</h2>
            <AiTraceView info={parseTraceInfo(entry.context.ki)} onCopy={(t) => void copy(t)} />
          </section>
        )}

        {entry && (
          <div className="mt-4 space-y-2" data-testid="viewer-sections">
            {Object.entries(entry.context)
              .filter(([key]) => key !== "ki")
              .map(([key, value]) => {
                const part = JSON.stringify(value, null, 2);
                return (
                  <details key={key} open={key !== "song"} className="rounded-lg bg-white/5 p-3">
                    <summary className="cursor-pointer select-none font-mono text-sm font-bold text-emerald-300">
                      {key}
                      <button
                        type="button"
                        className="ml-3 rounded bg-white/10 px-2 py-0.5 font-sans text-xs font-normal text-white"
                        onClick={(e) => {
                          e.preventDefault();
                          void copy(part);
                        }}
                      >
                        kopieren
                      </button>
                    </summary>
                    <pre className="mt-2 select-text overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-snug text-emerald-100">
                      {part}
                    </pre>
                  </details>
                );
              })}
          </div>
        )}

        {log.length > 0 && (
          <section className="mt-6">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold">Protokoll des Kiosks</h2>
              <button
                type="button"
                className="rounded-md bg-white/15 px-3 py-1 text-sm font-semibold hover:bg-white/25"
                onClick={() =>
                  void fetch("/api/log", { method: "DELETE" }).then((r) => {
                    if (r.ok) setLog([]);
                    flash(r.ok ? "Protokoll geleert ✓" : "Leeren fehlgeschlagen");
                  })
                }
                data-testid="viewer-log-clear"
              >
                Leeren
              </button>
            </div>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {log.map((e, i) => (
                <li
                  key={i}
                  className={e.level === "fehler" ? "text-red-300" : e.level === "warnung" ? "text-amber-300" : "text-white/80"}
                >
                  {new Date(e.at).toLocaleString("de-AT")} · {e.source}: {e.message}
                  {e.count > 1 ? ` (×${e.count})` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
