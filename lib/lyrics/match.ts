import { cleanTitle, normalizeLine } from "./text";
import type { TrackQuery } from "./types";

function tokens(s: string) {
  return new Set(normalizeLine(cleanTitle(s)).split(" ").filter(Boolean));
}

/** Anteil gemeinsamer Wörter (0..1), bezogen auf die kürzere Seite. */
export function overlap(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let n = 0;
  for (const t of ta) if (tb.has(t)) n++;
  return n / Math.min(ta.size, tb.size);
}

const VERSION_WORDS = /\b(live|instrumental|karaoke|acoustic|remix|sped up|slowed|cover|demo)\b/i;

/**
 * Prüft, ob ein Provider-Treffer wirklich der gesuchte Song ist.
 * Schützt vor falschen Treffern und Lockvogel-Antworten inoffizieller Schnittstellen.
 */
export function isSameTrack(q: TrackQuery, c: { title: string; artists: string[]; durationMs?: number }) {
  if (overlap(q.title, c.title) < 0.6) return false;
  if (!q.artists.some((qa) => c.artists.some((ca) => overlap(qa, ca) >= 0.6))) return false;
  // „Live“, „Instrumental“ usw. nur, wenn auch so gesucht
  if (VERSION_WORDS.test(c.title) && !VERSION_WORDS.test(q.title)) return false;
  if (c.durationMs && Math.abs(c.durationMs - q.durationMs) > 3500) return false;
  return true;
}
