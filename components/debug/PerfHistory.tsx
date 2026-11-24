"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LogEntry } from "@/lib/live/log-schema";
import { parsePerfSample, perfGrade, summarizePerf, type PerfSample } from "@/lib/live/perf-samples";

const GRADE_COLOR = { flüssig: "text-emerald-300", knapp: "text-amber-300", ruckelt: "text-red-300" } as const;

function time(at: number) {
  return new Date(at).toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

/** Verlauf als kleine Linie: Mittel (Linie) und schlechtester Wert (Punkte) je Probe, Raster bei 20/30 fps */
function Sparkline({ samples }: { samples: PerfSample[] }) {
  const w = 640;
  const h = 90;
  // Maßstab nach den Werten (mindestens bis 40 fps), damit Unterschiede zwischen 15 und 35 fps sichtbar sind
  const max = Math.max(40, ...samples.map((s) => s.fps)) + 5;
  const x = (i: number) => (samples.length < 2 ? w / 2 : (i / (samples.length - 1)) * w);
  const y = (fps: number) => h - (fps / max) * h;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-2 h-24 w-full"
      role="img"
      aria-label="Bildrate über die Zeit"
      data-testid="perf-line"
    >
      {[20, 30].map((f) => (
        <g key={f}>
          <line x1={0} x2={w} y1={y(f)} y2={y(f)} stroke="white" strokeOpacity={0.15} strokeDasharray="4 4" />
          <text x={w - 4} y={y(f) - 3} fill="white" fillOpacity={0.45} fontSize={10} textAnchor="end">
            {f} fps
          </text>
        </g>
      ))}
      <polyline points={samples.map((s, i) => `${x(i)},${y(s.fps)}`).join(" ")} fill="none" stroke="#6ee7b7" strokeWidth={2} />
      {samples.map((s, i) => (
        <circle key={i} cx={x(i)} cy={y(s.minFps)} r={2.5} fill={s.minFps < 20 ? "#fca5a5" : "#fcd34d"} />
      ))}
    </svg>
  );
}

/**
 * Bildrate des Kiosks (aus den Leistungsproben im Protokoll, letzte 7 Tage): je Bühne und Qualitätsstufe Mittel und
 * schlechtester Wert – zeigt, wo der Pi ins Ruckeln kommt.
 */
export function PerfHistory({ auto }: { auto: boolean }) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/log", { cache: "no-store" });
      if (r.ok) setEntries(((await r.json()) as { entries: LogEntry[] }).entries);
    } catch {
      /* Anzeige bleibt beim letzten Stand */
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    if (!auto) return () => clearTimeout(first);
    const id = setInterval(() => void load(), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [auto, load]);

  const samples = useMemo(
    () =>
      (entries ?? [])
        .map(parsePerfSample)
        .filter((s): s is PerfSample => !!s)
        .sort((a, b) => a.at - b.at),
    [entries],
  );
  const groups = useMemo(() => summarizePerf(samples), [samples]);
  if (!entries) return null;

  return (
    <section className="mt-6 rounded-xl bg-white/5 p-4" data-testid="perf-history">
      <h2 className="text-lg font-bold">Bildrate am Kiosk</h2>
      <p className="mt-1 text-sm text-white/60">
        Alle 5 Minuten während Musik läuft: Mittel und schlechtester Wert. Flüssig ab 28 fps, unter 20 fps ruckelt es sichtbar.
      </p>
      {samples.length === 0 ? (
        <p className="mt-3 text-sm text-white/70" data-testid="perf-empty">
          Noch keine Proben – sie kommen, sobald das Dashboard eine Weile mit Musik läuft.
        </p>
      ) : (
        <>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-white/50">
              <tr>
                <th className="py-1 font-semibold">Bühne</th>
                <th className="font-semibold">Qualität</th>
                <th className="font-semibold">Mittel</th>
                <th className="font-semibold">schlechtester</th>
                <th className="font-semibold">Proben</th>
                <th className="font-semibold">zuletzt</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={`${g.theme}${g.quality}`} className="border-t border-white/10" data-testid="perf-row">
                  <td className="py-1 font-semibold">{g.theme}</td>
                  <td>{g.quality}</td>
                  <td className={GRADE_COLOR[perfGrade(g.avgFps)]}>
                    {g.avgFps} fps · {perfGrade(g.avgFps)}
                  </td>
                  <td className={GRADE_COLOR[perfGrade(g.minFps)]}>{g.minFps} fps</td>
                  <td>{g.samples}</td>
                  <td className="text-white/60">{time(g.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Sparkline samples={samples.slice(-60)} />
        </>
      )}
    </section>
  );
}
