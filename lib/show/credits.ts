import type { LogEntry, Recap } from "./recap";

/**
 * Abspann des Abends – wie am Ende eines Konzertfilms: Setlist mit Zugaben und Höhepunkten, wer auf der Bühne stand,
 * Licht und Regie, Dank ans Publikum. Läuft einmal je Abend, kurz nachdem die Musik aufgehört hat.
 */
export type CreditLine = { kind: "titel" | "abschnitt" | "zeile" | "dank"; text: string; sub?: string };

/** so lange nach dem Ende des letzten Songs rollt der Abspann noch an (danach gleich der Rückblick) */
export const CREDITS_WINDOW_MS = 5 * 60_000;

const PHASE: Partial<Record<NonNullable<LogEntry["phase"]>, string>> = { zugabe: "Zugabe", hoehepunkt: "Höhepunkt" };

export function creditsFor(recap: Recap, opts: { date: string; lamps?: boolean }): CreditLine[] {
  const songs = recap.setlist;
  const artists = new Map<string, number>();
  for (const e of songs) for (const a of e.artist.split(/,\s*/)) artists.set(a, (artists.get(a) ?? 0) + 1);
  return [
    { kind: "titel", text: "Sonic Stage präsentiert" },
    { kind: "titel", text: "Euer Abend", sub: opts.date },
    { kind: "abschnitt", text: "Setlist" },
    ...songs.map((e, i) => ({
      kind: "zeile" as const,
      text: `${i + 1}. ${e.title}${e.liked ? " ♥" : ""}`,
      sub: [e.artist, e.phase ? PHASE[e.phase] : undefined].filter(Boolean).join(" · "),
    })),
    { kind: "abschnitt", text: "Auf der Bühne" },
    ...[...artists].map(([name, n]) => ({ kind: "zeile" as const, text: name, sub: `${n} Song${n === 1 ? "" : "s"}` })),
    { kind: "abschnitt", text: "Hinter der Bühne" },
    { kind: "zeile", text: "Licht, Kamera & Regie", sub: "Sonic Stage" },
    ...(opts.lamps ? [{ kind: "zeile" as const, text: "Raumlicht", sub: "Govee-Lampen" }] : []),
    { kind: "zeile", text: "Lyrics, Infos & Fotos", sub: "Better Lyrics, LRCLIB, Wikipedia, TheAudioDB" },
    { kind: "zeile", text: "Publikum", sub: "ihr" },
    { kind: "dank", text: "Danke, dass ihr da wart!" },
  ];
}

/** Rollt der Abspann? Abend mit Rückblick, Musik gerade vorbei, für diesen Abend noch nicht gezeigt */
export function shouldRollCredits(recap: Recap | null, now: number, shownFor: number | null): boolean {
  const last = recap?.setlist.at(-1);
  if (!recap || !last || shownFor === recap.since) return false;
  const since = now - (last.at + last.durationMs);
  return since >= -10_000 && since <= CREDITS_WINDOW_MS;
}

/** Laufzeit: genug Zeit zum Lesen (≈ 1,6 s je Zeile), mindestens 25 s */
export const creditsDurationS = (lines: number) => Math.max(25, Math.round(lines * 1.6));
