"use client";

import { useEffect, useState } from "react";
import { useSongContext } from "@/lib/song-context/store";
import { aiTraceSchema, type AiTrace, type AiTraceInfo } from "@/lib/show/trace";

const OUTCOME: Record<AiTrace["outcome"], string> = {
  ok: "Brief übernommen",
  abgelehnt: "abgelehnt",
  ungültig: "Antwort unbrauchbar",
  konfiguration: "Einrichtungsfehler",
  vorübergehend: "vorübergehender Fehler",
};

/** Antwort hübsch: JSON eingerückt, sonst wie geliefert */
function pretty(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Frage und Antwort als ein Text zum Kopieren */
export function traceText(t: AiTrace): string {
  return [
    `# Anweisung (System)\n${t.system}`,
    `# Frage (Song)\n${t.user}`,
    `# Antwort${t.servedModel ? ` (${t.servedModel})` : ""}\n${t.response ? pretty(t.response) : (t.error ?? "–")}`,
  ].join("\n\n");
}

/**
 * Lädt zur laufenden Regie die komplette Frage und Antwort der KI (vom Server-Cache) – neu, sobald die Regie für
 * den aktuellen Song fertig ist.
 */
export function useAiTrace(): AiTraceInfo | null {
  const trackKey = useSongContext((s) => s.song?.trackKey);
  const showState = useSongContext((s) => s.song?.status.show?.state);
  const [info, setInfo] = useState<{ key: string; data: AiTraceInfo } | null>(null);
  useEffect(() => {
    if (!trackKey || showState === "loading") return;
    let alive = true;
    fetch(`/api/show/trace?track=${encodeURIComponent(trackKey)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AiTraceInfo>) : null))
      .then((data) => alive && data && setInfo({ key: trackKey, data }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [trackKey, showState]);
  return info && info.key === trackKey ? info.data : null;
}

/** Aus einem gesendeten Song-Kontext (unbekannte Form) lesen */
export function parseTraceInfo(v: unknown): AiTraceInfo | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { ai?: unknown; trace?: unknown };
  const trace = aiTraceSchema.safeParse(o.trace);
  const ai = o.ai && typeof o.ai === "object" ? (o.ai as AiTraceInfo["ai"]) : null;
  return { ai, trace: trace.success ? trace.data : null };
}

/** Komplette Frage und Antwort der KI-Regie (Debug-Panel, /debug) */
export function AiTraceView({ info, onCopy }: { info: AiTraceInfo | null; onCopy?: (text: string) => void }) {
  if (!info) return <p className="font-sans text-xs text-white/50">lädt … (nur angemeldet)</p>;
  if (!info.ai)
    return (
      <p className="font-sans text-xs text-white/70" data-testid="ai-trace-none">
        Keine KI eingerichtet (ANTHROPIC_API_KEY oder OPENAI_API_KEY fehlt) – die Show läuft nach festen Regeln.
      </p>
    );
  const t = info.trace;
  if (!t)
    return (
      <p className="font-sans text-xs text-white/70" data-testid="ai-trace-none">
        {info.ai.model}: zu diesem Song keine Mitschrift gespeichert – die KI wurde noch nicht gefragt oder die Antwort stammt aus
        der Zeit vor der Mitschrift. Beim nächsten neuen Song erscheint sie hier.
      </p>
    );
  const block = "mt-1 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words rounded bg-white/5 p-2 font-mono text-[11px]";
  return (
    <div className="space-y-1 font-sans text-xs text-white/80" data-testid="ai-trace">
      <p>
        <span className="font-bold text-white">{t.servedModel ?? t.model}</span>
        {t.servedModel && t.servedModel !== t.model ? ` (angefragt: ${t.model})` : ""} · {t.provider} · gefragt{" "}
        {new Date(t.at).toLocaleString("de-AT")} · {(t.ms / 1000).toFixed(1)} s
        {t.usage ? ` · ${t.usage.input ?? "?"} Token rein, ${t.usage.output ?? "?"} raus` : ""}
        {t.stop ? ` · Ende: ${t.stop}` : ""} ·{" "}
        <span className={t.outcome === "ok" ? "text-emerald-300" : "text-amber-300"}>{OUTCOME[t.outcome]}</span>
        {onCopy && (
          <button
            type="button"
            className="ml-2 rounded bg-white/15 px-2 py-0.5 font-semibold text-white hover:bg-white/25"
            onClick={() => onCopy(traceText(t))}
            data-testid="ai-trace-copy"
          >
            Frage + Antwort kopieren
          </button>
        )}
      </p>
      <details>
        <summary className="cursor-pointer font-semibold text-white">
          Anweisung an die KI (System, {t.system.length} Zeichen)
        </summary>
        <pre className={block}>{t.system}</pre>
      </details>
      <details open>
        <summary className="cursor-pointer font-semibold text-white">Frage: Songbeschreibung</summary>
        <pre className={block}>{t.user}</pre>
      </details>
      <details open>
        <summary className="cursor-pointer font-semibold text-white">Antwort der KI</summary>
        <pre className={`${block} ${t.error ? "text-red-300" : "text-emerald-200"}`}>
          {t.response ? pretty(t.response) : (t.error ?? "– (leer)")}
        </pre>
      </details>
    </div>
  );
}
