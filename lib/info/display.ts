import type { Derived, Info, Photo, SongStatic } from "@/lib/song-context/schema";

export const CARD_ROTATE_MS = 12_000;
export const FACT_PERIOD_MS = 24_000;
export const FACT_VISIBLE_MS = 7_000;

type ArtistEntry = {
  id: string;
  name: string;
  summary: string;
  facts: string[];
  wikiUrl: string;
  lang: "de" | "en";
  photo?: Photo;
};

/** Artists mit Infos in Song-Reihenfolge (Lead zuerst), samt zugehörigem Foto. */
export function infoEntries(song: SongStatic): ArtistEntry[] {
  const info: Info | undefined = song.info;
  if (!info) return [];
  return song.artists.flatMap((a) => {
    const i = info.artists[a.spotifyId];
    if (!i || (!i.summary && !info.photos.some((p) => p.artistId === a.spotifyId))) return [];
    return [
      {
        id: a.spotifyId,
        name: i.name ?? a.name,
        summary: i.summary,
        facts: i.facts,
        wikiUrl: i.wikiUrl,
        lang: i.lang,
        photo: info.photos.find((p) => p.artistId === a.spotifyId),
      },
    ];
  });
}

/**
 * Infokarte: in Intro, Outro, Instrumentalteilen und langen Gesangspausen; bei Songs ohne Lyrics
 * zu Beginn und danach jede Minute kurz. Bei mehreren Artists (Feature) abwechselnd.
 */
export function infoCardAt(song: SongStatic, d: Derived, t: number): ArtistEntry | null {
  const entries = infoEntries(song);
  if (!entries.length) return null;
  const hasLyrics = !!song.lyrics?.lines.length && song.lyrics.quality !== "plain";
  const calmSection = d.section === "intro" || d.section === "outro" || d.section === "instrumental";
  const longGap = !d.lineActive && (d.secondsToNextLyric ?? 0) > 8;
  const noLyricsSlot = !hasLyrics && (t < 20_000 || t % 60_000 < 12_000);
  if (!(calmSection || longGap || noLyricsSlot) || (hasLyrics && d.lineActive)) return null;
  return entries[Math.floor(t / CARD_ROTATE_MS) % entries.length]!;
}

/** Fakten-Ticker in Strophen: alle 24 s für 7 s ein Kurzfakt (z. B. „Queen · Gegründet 1970“). */
export function factAt(song: SongStatic, d: Derived, t: number): string | null {
  if (d.section !== "verse") return null;
  const facts = infoEntries(song).flatMap((e) => e.facts.map((f) => `${e.name} · ${f}`));
  if (!facts.length || t % FACT_PERIOD_MS >= FACT_VISIBLE_MS) return null;
  return facts[Math.floor(t / FACT_PERIOD_MS) % facts.length]!;
}

/** Foto für die LED-Wand: das des Leads (sonst das erste vorhandene). */
export function wallPhoto(song: SongStatic): Photo | null {
  const photos = song.info?.photos ?? [];
  return photos.find((p) => p.artistId === song.artists[0]?.spotifyId) ?? photos[0] ?? null;
}
