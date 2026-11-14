import type { Lyrics } from "@/lib/song-context/schema";
import type { Breaker } from "./breaker";
import { detectSections } from "./sections";
import type { LyricsProvider, ProviderResult, TrackQuery } from "./types";
import { estimateWords } from "./word-timing";

const SYNC_SCORE = { word: 3, line: 2, plain: 1 } as const;
/** Erlaubte Abweichung der Songdauer (andere Version/Edit → falsche Timings) */
const DURATION_TOLERANCE_MS = 3500;

export type Attempt = { provider: string; outcome: "ok" | "empty" | "instrumental" | "mismatch" | "error" | "timeout" | "skipped"; ms: number };

export type ChainResult = { lyrics: Lyrics | null; instrumental: boolean; attempts: Attempt[] };

function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("timeout")), ms);
  return p(ctrl.signal).finally(() => clearTimeout(timer));
}

/** Rangfolge: eigene Korrekturen > Wort-Sync > Zeilen-Sync > reiner Text; dann Provider-Priorität. */
export function rank(results: Array<{ r: ProviderResult; p: LyricsProvider }>) {
  return [...results].sort((a, b) => {
    if (!!a.p.authoritative !== !!b.p.authoritative) return a.p.authoritative ? -1 : 1;
    const s = SYNC_SCORE[b.r.sync] - SYNC_SCORE[a.r.sync];
    return s !== 0 ? s : a.p.priority - b.p.priority;
  });
}

/** Wandelt ein Provider-Ergebnis in das Lyrics-Format des Song-Kontexts. */
export function toLyrics(r: ProviderResult, q: TrackQuery): Lyrics {
  if (r.sync === "plain") {
    return { provider: r.provider, quality: "plain", lines: r.lines, sections: [] };
  }
  const estimated = r.sync === "line";
  const lines = estimated ? r.lines.map((l) => ({ ...l, words: estimateWords(l) })) : r.lines;
  return {
    provider: r.provider,
    quality: estimated ? "word-estimated" : "word",
    lines,
    sections: detectSections(lines, q.durationMs),
    ...(r.singers ? { singers: r.singers } : {}),
  };
}

/** Fragt alle Provider parallel ab und nimmt das beste Ergebnis. */
export async function findLyrics(
  q: TrackQuery,
  providers: LyricsProvider[],
  opts: { timeoutMs?: number; breaker?: Breaker } = {},
): Promise<ChainResult> {
  const timeoutMs = opts.timeoutMs ?? 2500;
  const attempts: Attempt[] = [];
  const found: Array<{ r: ProviderResult; p: LyricsProvider }> = [];
  let instrumental = false;

  await Promise.all(
    providers.map(async (p) => {
      if (opts.breaker?.isOpen(p.id)) return attempts.push({ provider: p.id, outcome: "skipped", ms: 0 });
      const t0 = Date.now();
      try {
        const r = await withTimeout((signal) => p.search(q, signal), timeoutMs);
        opts.breaker?.success(p.id);
        const ms = Date.now() - t0;
        if (!r) return attempts.push({ provider: p.id, outcome: "empty", ms });
        if (r.instrumental) {
          instrumental = true;
          return attempts.push({ provider: p.id, outcome: "instrumental", ms });
        }
        if (!p.authoritative && r.durationMs && Math.abs(r.durationMs - q.durationMs) > DURATION_TOLERANCE_MS) {
          return attempts.push({ provider: p.id, outcome: "mismatch", ms });
        }
        if (!r.lines.length) return attempts.push({ provider: p.id, outcome: "empty", ms });
        found.push({ r, p });
        attempts.push({ provider: p.id, outcome: "ok", ms });
      } catch (e) {
        opts.breaker?.failure(p.id);
        const timeout = e instanceof Error && /timeout|abort/i.test(`${e.message} ${e.name}`);
        attempts.push({ provider: p.id, outcome: timeout ? "timeout" : "error", ms: Date.now() - t0 });
      }
    }),
  );

  const best = rank(found)[0];
  return { lyrics: best ? toLyrics(best.r, q) : null, instrumental: !best && instrumental, attempts };
}
