import type { Concert } from "@/lib/song-context/schema";
import { concertKey } from "./merge";
import type { RawEvent } from "./types";

/** Was aus einem Rohtermin geworden ist */
export type RawOutcome = "gezeigt" | "vergangen" | "abgesagt" | "nicht unter den ersten 5";

export type RawRow = RawEvent & { outcome: RawOutcome; distanceKm?: number };

/**
 * Für /debug: jeder Rohtermin jeder Quelle mit dem, was daraus wurde. Ein Konzert gilt als gezeigt, wenn es (gleicher
 * Tag, gleiche Stadt) im Ergebnis steht; meldet irgendeine Quelle es abgesagt, fällt es für alle weg.
 */
export function classifyRaw(
  artist: string,
  lists: ReadonlyArray<{ events: RawEvent[] }>,
  concerts: readonly Concert[],
  today: string,
): RawRow[] {
  const shown = new Map(concerts.filter((c) => c.artistName === artist).map((c) => [concertKey(c), c]));
  const cancelled = new Set(lists.flatMap((l) => l.events.filter((e) => e.cancelled).map(concertKey)));
  return lists
    .flatMap((l) => l.events)
    .map((e): RawRow => {
      const c = shown.get(concertKey(e));
      const outcome: RawOutcome =
        e.date < today ? "vergangen" : cancelled.has(concertKey(e)) ? "abgesagt" : c ? "gezeigt" : "nicht unter den ersten 5";
      return { ...e, outcome, ...(c?.distanceKm !== undefined ? { distanceKm: c.distanceKm } : {}) };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.provider.localeCompare(b.provider));
}

/** Eine Zeile fürs Kiosk-Protokoll, wenn Quellen ausfallen – je Quelle einmal, mit den betroffenen Künstlern */
export function failureMessages(sources: ReadonlyArray<{ artist: string; provider: string; state: string; error?: string }>) {
  const byProvider = new Map<string, { artists: string[]; error: string }>();
  for (const s of sources) {
    if (s.state !== "fehler") continue;
    const entry = byProvider.get(s.provider) ?? { artists: [], error: s.error ?? "Fehler" };
    entry.artists.push(s.artist);
    byProvider.set(s.provider, entry);
  }
  return [...byProvider].map(([provider, { artists, error }]) => `${provider} (${artists.join(", ")}): ${error}`);
}
