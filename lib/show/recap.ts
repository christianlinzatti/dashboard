import { createStore } from "zustand/vanilla";
import type { EveningPhase } from "./evening";

/**
 * Rückblick auf den Abend: Welche Songs liefen, was waren die Höhepunkte, gab es eine Zugabe? Das Protokoll liegt im
 * Browser (localStorage), damit ein Neustart des Kiosks (Watchdog) den Abend nicht vergisst. Ein neuer Abend beginnt,
 * wenn länger als sechs Stunden nichts lief.
 */
export type LogEntry = {
  trackKey: string;
  title: string;
  artist: string;
  coverUrl?: string;
  durationMs: number;
  /** Start (Unix-ms) */
  at: number;
  phase?: EveningPhase;
  liked?: boolean;
  finished?: boolean;
};

const STORAGE_KEY = "ss_abend";
/** So lange Pause beginnt einen neuen Abend */
export const NEW_EVENING_MS = 6 * 3600_000;
const MAX_ENTRIES = 80;

function load(): LogEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as LogEntry[]).filter((e) => e && typeof e.trackKey === "string") : [];
  } catch {
    return [];
  }
}
function save(log: LogEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    /* privater Modus: dann nur im Speicher */
  }
}

type State = {
  log: LogEntry[];
  hydrate: () => void;
  /** Songstart festhalten; derselbe Song direkt nacheinander ergänzt nur */
  start: (e: Omit<LogEntry, "phase" | "liked" | "finished">) => void;
  /** Phase, Like, ausgespielt nachtragen (letzter Eintrag dieses Songs) */
  update: (trackKey: string, patch: Partial<Pick<LogEntry, "phase" | "liked" | "finished">>) => void;
};

export const recapStore = createStore<State>()((set, get) => ({
  log: [],
  hydrate: () => set({ log: load() }),
  start: (e) => {
    const log = get().log;
    const last = log.at(-1);
    if (last?.trackKey === e.trackKey) return;
    const fresh = last && e.at - last.at > NEW_EVENING_MS ? [] : log;
    const next = [...fresh, e].slice(-MAX_ENTRIES);
    save(next);
    set({ log: next });
  },
  update: (trackKey, patch) => {
    const log = get().log;
    const i = log.findLastIndex((x) => x.trackKey === trackKey);
    if (i < 0) return;
    const merged = { ...log[i]!, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
    if (JSON.stringify(merged) === JSON.stringify(log[i])) return;
    const next = log.with(i, merged);
    save(next);
    set({ log: next });
  },
}));

export type Recap = {
  songs: number;
  minutes: number;
  since: number;
  highlights: string[];
  encores: string[];
  liked: number;
  topArtist?: { name: string; songs: number };
  /** die letzten Songs (neueste zuerst) */
  recent: LogEntry[];
};

/** Mindestens so viele Songs, damit sich ein Rückblick lohnt */
export const MIN_SONGS = 3;

/** Zusammenfassung des laufenden Abends – null, wenn zu wenig lief oder der Abend vorbei ist (lange Pause) */
export function summarize(log: readonly LogEntry[], now: number): Recap | null {
  const last = log.at(-1);
  if (!last || now - last.at > NEW_EVENING_MS) return null;
  // nur der jüngste Abend (nach der letzten langen Pause)
  let start = log.length - 1;
  while (start > 0 && log[start]!.at - log[start - 1]!.at <= NEW_EVENING_MS) start--;
  const evening = log.slice(start);
  if (evening.length < MIN_SONGS) return null;
  // gehörte Zeit: bis zum nächsten Song, höchstens die Songlänge
  const ms = evening.reduce((sum, e, i) => {
    const next = evening[i + 1]?.at ?? Math.min(now, e.at + e.durationMs);
    return sum + Math.max(0, Math.min(next - e.at, e.durationMs));
  }, 0);
  const byArtist = new Map<string, number>();
  for (const e of evening) byArtist.set(e.artist, (byArtist.get(e.artist) ?? 0) + 1);
  const [name, songs] = [...byArtist].sort((a, b) => b[1] - a[1])[0]!;
  return {
    songs: evening.length,
    minutes: Math.round(ms / 60_000),
    since: evening[0]!.at,
    highlights: evening.filter((e) => e.phase === "hoehepunkt").map((e) => e.title),
    encores: evening.filter((e) => e.phase === "zugabe").map((e) => e.title),
    liked: evening.filter((e) => e.liked).length,
    ...(songs >= 2 ? { topArtist: { name, songs } } : {}),
    recent: evening.slice(-8).reverse(),
  };
}
