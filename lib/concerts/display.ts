import type { Concert, Derived, SongStatic } from "@/lib/song-context/schema";

/** Konzertkarte in den letzten 15 s des Songs (ruhiger Teil, keine aktive Zeile). */
export const CONCERT_WINDOW_MS = 15_000;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MONTHS = ["Jän.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
};

/** „Sa, 14. März“ (österreichisch: Jänner). */
export function formatConcertDate(iso: string): string {
  const d = new Date(utc(iso));
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`;
}

export function daysUntil(iso: string, today: string): number {
  return Math.round((utc(iso) - utc(today)) / 86_400_000);
}

export function countdown(iso: string, today: string): string {
  const n = daysUntil(iso, today);
  if (n <= 0) return "heute";
  if (n === 1) return "morgen";
  if (n < 60) return `in ${n} Tagen`;
  return `in ${Math.round(n / 30)} Monaten`;
}

/** Lokales Datum JJJJ-MM-TT (Browser-Zeitzone). */
export function todayLocal(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export type ConcertCard = { concerts: Concert[]; near: boolean; liveHint: string | null };

/** Termine aller Artists: im Umkreis zuerst, dann nach Datum; höchstens drei. */
export function topConcerts(song: SongStatic, radiusKm = 200): { list: Concert[]; near: boolean } {
  const isNear = (c: Concert) => c.distanceKm !== undefined && c.distanceKm <= radiusKm;
  const all = [...(song.concerts ?? [])].sort((a, b) => Number(isNear(b)) - Number(isNear(a)) || a.date.localeCompare(b.date));
  return { list: all.slice(0, 3), near: all.some(isNear) };
}

/** „Zuletzt live am … in … – dieser Song war dabei“ (setlist.fm). */
export function liveHint(song: SongStatic): string | null {
  const lead = song.artists[0];
  const sl = lead && song.setlists?.[lead.spotifyId];
  if (!sl) return null;
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s*[([].*$/, "")
      .trim();
  const played = sl.songs.some((s) => norm(s) === norm(song.track.title));
  const [y, m, d] = sl.date.split("-");
  return `Zuletzt live: ${d}.${m}.${y}${sl.city ? ` in ${sl.city}` : ""}${played ? " – dieser Song war dabei" : ""}`;
}

export function concertCardAt(song: SongStatic, d: Derived, t: number): ConcertCard | null {
  if (!song.concerts?.length) return null;
  if (t < song.track.durationMs - CONCERT_WINDOW_MS || d.lineActive) return null;
  const { list, near } = topConcerts(song);
  return { concerts: list, near, liveHint: liveHint(song) };
}
