"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProviderStatus } from "@/lib/lyrics/types";

/** „in 12 min“ bzw. „gleich“ bis zum Ablauf der Pause */
function until(ms: number, now: number) {
  const s = Math.max(0, Math.round((ms - now) / 1000));
  return s < 60 ? "gleich" : s < 3600 ? `in ${Math.round(s / 60)} min` : `in ${Math.round(s / 3600)} h`;
}

/**
 * Betriebszustand der Lyrics-Provider (nur die mit Circuit-Breaker, derzeit Spotify Color-Lyrics): läuft, pausiert
 * (mit Grund und bis wann) oder nicht konfiguriert. So ist sichtbar, wann ein Secret/sp_dc erneuert werden muss.
 */
export function LyricsStatus({ auto }: { auto: boolean }) {
  const [data, setData] = useState<{ providers: ProviderStatus[]; now: number } | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/lyrics-status", { cache: "no-store" });
      if (!r.ok) return setError(true);
      setData((await r.json()) as { providers: ProviderStatus[]; now: number });
      setError(false);
    } catch {
      setError(true);
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

  if (error || !data || data.providers.length === 0) return null;

  return (
    <section className="mt-4 rounded-lg bg-white/5 p-3" data-testid="lyrics-status">
      <h2 className="mb-2 text-sm font-bold">Spotify-Zugriff (Lyrics &amp; Canvas)</h2>
      <ul className="space-y-1 text-sm">
        {data.providers.map((p) => {
          const state = !p.configured ? "aus" : p.paused ? "pausiert" : "läuft";
          const color = !p.configured
            ? "bg-white/10 text-white/60"
            : p.paused
              ? "bg-amber-500/25 text-amber-200"
              : "bg-emerald-600/30 text-emerald-200";
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-2" data-testid={`lyrics-status-${p.id}`}>
              <span className="font-mono">{p.id}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`} data-state={state}>
                {state}
              </span>
              {p.paused && p.pausedUntil && <span className="text-white/60">wieder {until(p.pausedUntil, data.now)}</span>}
              {p.reason && <span className="w-full text-xs text-white/50">{p.reason}</span>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-white/40">
        „pausiert“ heißt: Spotify hat Token/Cookie abgelehnt – <code>SPOTIFY_TOTP_SECRET</code>, <code>SPOTIFY_TOTP_VERSION</code>{" "}
        oder <code>SPOTIFY_SP_DC</code> erneuern. Solange liefern andere Provider die Lyrics; Canvas bleibt aus.
      </p>
    </section>
  );
}
