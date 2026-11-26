"use client";

import { useCallback, useEffect, useState } from "react";
import { BRIDGE_URL } from "@/components/bridge/useBridge";
import { askBridgeConcerts } from "@/lib/bridge/concerts";
import type { RawOutcome, RawRow } from "@/lib/concerts/debug";
import { formatConcertDate } from "@/lib/concerts/display";
import type { SourceReport } from "@/lib/concerts/service";
import type { Concert } from "@/lib/song-context/schema";

type Answer = {
  today: string;
  fresh: boolean;
  area: { name: string; radiusKm: number };
  providers: string[];
  missing?: Array<{ id: string; hint: string }>;
  sources: SourceReport[];
  concerts: Concert[];
  raw: Array<{ artist: string; rows: RawRow[] }>;
};

const OUTCOME_COLOR: Record<RawOutcome, string> = {
  gezeigt: "text-emerald-300",
  vergangen: "text-white/40",
  abgesagt: "text-red-300",
  "nicht unter den ersten 5": "text-white/60",
};

/** Künstler des zuletzt gesendeten Songs aus dem Song-Kontext */
export function artistsOf(context: Record<string, unknown> | undefined): string[] {
  const song = context?.song as { artists?: Array<{ name?: unknown }> } | null | undefined;
  return (song?.artists ?? []).map((a) => (typeof a.name === "string" ? a.name : "")).filter(Boolean);
}

/**
 * Konzerttermine prüfen: je Künstler und Quelle (oeticket, eventim.de, Ticketmaster, Bandsintown) Status, Dauer,
 * Fehler und Anzahl; darunter das Ergebnis wie auf der Konzertkarte und alle Rohtermine mit dem, was aus ihnen wurde.
 */
export function ConcertDebug({ initialArtists }: { initialArtists: string[] }) {
  const [names, setNames] = useState(initialArtists.join(", "));
  const [touched, setTouched] = useState(false);
  const [data, setData] = useState<Answer | null>(null);
  const [state, setState] = useState<"bereit" | "pi" | "laden" | "fehler">("bereit");
  const [error, setError] = useState("");

  // Künstler des neuen Songs übernehmen, solange niemand von Hand etwas eingetragen hat
  const initial = initialArtists.join(", ");
  useEffect(() => {
    if (touched) return;
    const id = setTimeout(() => setNames(initial), 0);
    return () => clearTimeout(id);
  }, [initial, touched]);

  const load = useCallback(
    async (fresh: boolean) => {
      if (!names.trim()) return;
      try {
        // oeticket/eventim.de über die Pi-Bridge (Heimanschluss), wenn sie läuft – sonst fragt der Server selbst
        setState("pi");
        const artists = names
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
          .slice(0, 5);
        const bridge = artists.length ? await askBridgeConcerts(BRIDGE_URL, artists, { fresh }) : null;
        setState("laden");
        const q = new URLSearchParams({ names, ...(fresh ? { fresh: "1" } : {}) });
        const r = bridge?.length
          ? await fetch("/api/concerts/debug", {
              method: "POST",
              cache: "no-store",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ names, fresh, bridge }),
            })
          : await fetch(`/api/concerts/debug?${q}`, { cache: "no-store" });
        if (!r.ok) {
          setError(r.status === 401 ? "Nicht angemeldet" : `Server antwortet mit ${r.status}`);
          return setState("fehler");
        }
        setData((await r.json()) as Answer);
        setState("bereit");
      } catch {
        setError("Keine Verbindung zum Server");
        setState("fehler");
      }
    },
    [names],
  );

  const button = "rounded-md bg-white/15 px-3 py-1.5 text-sm font-semibold hover:bg-white/25 disabled:opacity-50";
  return (
    <section className="mt-4 rounded-lg bg-white/5 p-3" data-testid="concert-debug">
      <h2 className="mb-2 text-sm font-bold">Konzerttermine</h2>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void load(false);
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-md bg-black/40 px-2 py-1.5 text-sm"
          value={names}
          onChange={(e) => {
            setTouched(true);
            setNames(e.target.value);
          }}
          placeholder="Künstler, durch Komma getrennt"
          aria-label="Künstler"
          data-testid="concert-debug-names"
        />
        <button type="submit" className={button} disabled={state === "laden" || state === "pi"} data-testid="concert-debug-load">
          Prüfen
        </button>
        <button type="button" className={button} disabled={state === "laden" || state === "pi"} onClick={() => void load(true)}>
          Ohne Cache
        </button>
      </form>
      {state === "pi" && (
        <p className="mt-2 text-sm text-white/60">
          Frage oeticket/eventim.de über die Pi-Bridge (Anfragen einzeln mit Pausen, beim ersten Mal bis zu 2 Minuten) …
        </p>
      )}
      {state === "laden" && <p className="mt-2 text-sm text-white/60">Frage die Quellen …</p>}
      {state === "fehler" && <p className="mt-2 text-sm text-red-300">{error}</p>}

      {data && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-white/60">
            Umkreis {data.area.radiusKm} km um {data.area.name} · heute {data.today} · Quellen:{" "}
            {data.providers.join(", ") || "keine"}
            {data.fresh ? " · frisch abgefragt" : ""}
          </p>

          {!!data.missing?.length && (
            <ul className="space-y-0.5 text-xs text-amber-200/80" data-testid="concert-debug-missing">
              {data.missing.map((m) => (
                <li key={m.id}>
                  <span className="font-mono">{m.id}</span>: {m.hint}
                </li>
              ))}
            </ul>
          )}
          <table className="w-full text-left text-xs" data-testid="concert-debug-sources">
            <thead className="text-white/50">
              <tr>
                <th className="py-1 pr-2">Künstler</th>
                <th className="pr-2">Quelle</th>
                <th className="pr-2">Status</th>
                <th className="pr-2 text-right">Termine</th>
                <th className="text-right">Dauer</th>
              </tr>
            </thead>
            {/* je Quelle ein eigener Block: Fehlertext in eigener Zeile, damit die Tabelle aufs Handy passt */}
            {data.sources.map((s) => (
              <tbody key={`${s.artist}-${s.provider}`} className="border-t border-white/10 font-mono" data-state={s.state}>
                <tr>
                  <td className="py-1 pr-2 font-sans">{s.artist}</td>
                  <td className="pr-2">
                    {s.provider}
                    {s.via === "pi" && <span className="ml-1 font-sans text-sky-300/80">(Pi)</span>}
                  </td>
                  <td className={`whitespace-nowrap pr-2 ${s.state === "ok" ? "text-emerald-300" : "text-red-300"}`}>
                    {s.state}
                    {s.cached && <span className="ml-1 font-sans text-white/50">(Cache)</span>}
                  </td>
                  <td className="pr-2 text-right">{s.events}</td>
                  <td className="whitespace-nowrap text-right">{s.ms !== undefined ? `${s.ms} ms` : "–"}</td>
                </tr>
                {s.error && (
                  <tr>
                    <td colSpan={5} className="pb-1 font-sans text-red-200/80">
                      {s.error}
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>
          <p className="text-xs text-white/40">
            „(Cache)“: Antwort von früher – vollständige Ergebnisse gelten 12 h, mit fehlender Quelle 30 min. „Ohne Cache“ fragt
            alle Quellen neu (höchstens alle 15 s). „(Pi)“: über die Pi-Bridge vom Heimanschluss abgefragt – Eventim sperrt den
            Server.
          </p>

          <div>
            <h3 className="font-semibold">Auf der Konzertkarte ({data.concerts.length})</h3>
            {data.concerts.length === 0 ? (
              <p className="text-white/60">Keine bevorstehenden Termine.</p>
            ) : (
              <ul className="mt-1 space-y-0.5 font-mono text-xs" data-testid="concert-debug-result">
                {data.concerts.map((c) => (
                  <li key={`${c.artistName}-${c.date}-${c.city}`}>
                    {formatConcertDate(c.date, data.today)} ({c.date}
                    {c.time ? ` ${c.time}` : ""}) · {c.artistName} · {c.city}
                    {c.venue ? `, ${c.venue}` : ""} · {c.distanceKm !== undefined ? `${c.distanceKm} km` : "Entfernung ?"}
                    {c.distanceKm !== undefined && c.distanceKm <= data.area.radiusKm ? " (im Umkreis)" : ""} · [
                    {c.providers.join(", ")}]{c.soldOut ? " · ausverkauft" : ""}
                    {c.ticketUrl ? " · Ticket-Link" : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.raw.map(({ artist, rows }) => (
            <details key={artist} className="rounded bg-black/20 p-2">
              <summary className="cursor-pointer select-none font-semibold">
                Rohtermine {artist} ({rows.length}; gezeigt {rows.filter((r) => r.outcome === "gezeigt").length})
              </summary>
              <ul className="mt-1 space-y-0.5 font-mono text-xs" data-testid="concert-debug-raw">
                {rows.map((r, i) => (
                  <li key={i} className={OUTCOME_COLOR[r.outcome]}>
                    {r.date} {r.time ?? "     "} · {r.provider} · {r.city}
                    {r.venue ? ` (${r.venue})` : ""}
                    {r.lat === undefined ? " · ohne Koordinaten" : r.geocoded ? " · Koordinaten ergänzt" : ""} → {r.outcome}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
