import { createStore } from "zustand/vanilla";
import type { Concert, SongStatic } from "@/lib/song-context/schema";

/**
 * Konzert-Erinnerung: Spielt ein Künstler, dem du folgst oder dessen Song du magst, in deinem Umkreis, merkt sich das
 * Dashboard den Termin (im Browser, wie der Rückblick) und zeigt ihn auf dem Startbildschirm, bis er vorbei ist.
 */
export type Reminder = {
  key: string;
  artistName: string;
  date: string;
  time?: string;
  city: string;
  venue: string;
  distanceKm?: number;
  ticketUrl?: string;
  soldOut?: boolean;
  /** warum: du folgst dem Künstler bzw. magst den Song */
  reason: "folgst" | "magst";
};

const STORAGE_KEY = "ss_konzert_erinnerung";
const MAX = 20;
/** so weit im Voraus erinnern */
export const REMIND_DAYS = 120;

const keyOf = (c: Pick<Concert, "artistName" | "date" | "city">) => `${c.artistName}|${c.date}|${c.city.toLowerCase()}`;

/** Termine des Songs, an die erinnert werden soll: im Umkreis, Künstler gefolgt oder Song gemocht */
export function remindersFrom(song: SongStatic, today: string): Reminder[] {
  const radius = song.concertArea?.radiusKm ?? 200;
  const liked = !!(song.user?.trackSaved || song.user?.lovedOnLastfm);
  return (song.concerts ?? []).flatMap((c): Reminder[] => {
    if (c.date < today || c.distanceKm === undefined || c.distanceKm > radius) return [];
    const follows = !!song.user?.artists[c.artistId]?.following;
    if (!follows && !liked) return [];
    return [
      {
        key: keyOf(c),
        artistName: c.artistName,
        date: c.date,
        ...(c.time ? { time: c.time } : {}),
        city: c.city,
        venue: c.venue,
        distanceKm: c.distanceKm,
        ...(c.ticketUrl ? { ticketUrl: c.ticketUrl } : {}),
        ...(c.soldOut ? { soldOut: true } : {}),
        reason: follows ? "folgst" : "magst",
      },
    ];
  });
}

/** Zusammenführen: neue Termine dazu (Neues ersetzt Altes, z. B. „ausverkauft“), Vergangenes weg, höchstens 20 */
export function mergeReminders(list: readonly Reminder[], add: readonly Reminder[], today: string): Reminder[] {
  const byKey = new Map(list.map((r) => [r.key, r]));
  for (const r of add) byKey.set(r.key, { ...byKey.get(r.key), ...r });
  return [...byKey.values()]
    .filter((r) => r.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, MAX);
}

/** Was der Startbildschirm zeigt: die nächsten Termine in den kommenden 120 Tagen */
export function upcomingReminders(list: readonly Reminder[], today: string, days = REMIND_DAYS): Reminder[] {
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  return list.filter((r) => r.date >= today && r.date <= until);
}

function load(): Reminder[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(raw)
      ? (raw as Reminder[]).filter((r) => r && typeof r.key === "string" && typeof r.date === "string")
      : [];
  } catch {
    return [];
  }
}

type State = {
  list: Reminder[];
  hydrate: (today: string) => void;
  add: (items: readonly Reminder[], today: string) => void;
};

export const reminderStore = createStore<State>()((set, get) => ({
  list: [],
  hydrate: (today) => set({ list: mergeReminders(load(), [], today) }),
  add: (items, today) => {
    if (!items.length) return;
    const list = mergeReminders(get().list.length ? get().list : load(), items, today);
    set({ list });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* privater Modus: nur im Speicher */
    }
  },
}));
