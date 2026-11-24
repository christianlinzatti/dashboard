import { concertCardAt } from "@/lib/concerts/display";
import type { Derived, Info, Photo, SongStatic } from "@/lib/song-context/schema";
import { aspect, diversify, rankPhotos } from "./photos";

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
  textSource: "wikipedia" | "theaudiodb";
  logo?: string;
  photo?: Photo;
  /** alle Fotos des Artists für die Karte (wechseln bei jedem Auftritt der Karte) */
  photos?: Photo[];
};

/** Karte zum Song selbst (Wikipedia-Artikel); das Cover steht ohnehin oben in der Leiste */
function songEntry(song: SongStatic): ArtistEntry | null {
  const wiki = song.info?.song?.wiki;
  if (!wiki) return null;
  return {
    id: "song",
    name: `„${song.track.title}“`,
    summary: wiki.text,
    facts: (song.info?.song?.trivia ?? []).slice(0, 2),
    wikiUrl: wiki.url,
    lang: wiki.lang,
    textSource: "wikipedia",
  };
}

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
        textSource: i.textSource ?? "wikipedia",
        ...(i.logo ? { logo: i.logo } : {}),
        ...cardPhotos(info.photos.filter((p) => p.artistId === a.spotifyId)),
      },
    ];
  });
}

/** Fotos für die Karte: bestes zuerst, dann je Quelle abwechselnd */
function cardPhotos(list: Photo[]): Pick<ArtistEntry, "photo" | "photos"> {
  const photos = diversify(rankPhotos(list, "card"));
  return photos.length ? { photo: photos[0], photos } : {};
}

/**
 * Infokarte: in Intro, Outro, Instrumentalteilen und langen Gesangspausen; bei Songs ohne Lyrics
 * zu Beginn und danach jede Minute kurz. Bei mehreren Artists (Feature) abwechselnd.
 */
export function infoCardAt(song: SongStatic, d: Derived, t: number): ArtistEntry | null {
  const own = songEntry(song);
  const entries = own ? [own, ...infoEntries(song)] : infoEntries(song);
  if (!entries.length || concertCardAt(song, d, t)) return null; // Konzertkarte hat Vorrang
  const hasLyrics = !!song.lyrics?.lines.length && song.lyrics.quality !== "plain";
  const calmSection = d.section === "intro" || d.section === "outro" || d.section === "instrumental";
  const longGap = !d.lineActive && (d.secondsToNextLyric ?? 0) > 8;
  const noLyricsSlot = !hasLyrics && (t < 20_000 || t % 60_000 < 12_000);
  if (!(calmSection || longGap || noLyricsSlot) || (hasLyrics && d.lineActive)) return null;
  const entry = entries[Math.floor(t / CARD_ROTATE_MS) % entries.length]!;
  // bei jedem neuen Auftritt der Karte das nächste Foto dieses Artists
  const round = Math.floor(t / (CARD_ROTATE_MS * entries.length));
  return entry.photos && entry.photos.length > 1 ? { ...entry, photo: entry.photos[round % entry.photos.length] } : entry;
}

/** „Ähnlich wie Queen · Freddie Mercury, David Bowie“ (Last.fm) */
function similarFact(song: SongStatic): string[] {
  const similar = song.user?.similar?.slice(0, 3);
  const lead = song.artists[0]?.name;
  return similar?.length && lead ? [`Ähnlich wie ${lead} · ${similar.join(", ")}`] : [];
}

/**
 * Fakten-Ticker in Strophen: alle 24 s für 7 s ein Kurzfakt (z. B. „Queen · Gegründet 1970“),
 * Song-Trivia von Genius zuerst („Neonlicht · Produziert von …“).
 */
export function factAt(song: SongStatic, d: Derived, t: number): string | null {
  if (d.section !== "verse") return null;
  const facts = [
    ...(song.info?.song?.trivia ?? []).map((f) => `${song.track.title} · ${f}`),
    ...infoEntries(song).flatMap((e) => e.facts.map((f) => `${e.name} · ${f}`)),
  ];
  // Tipp als zweiter Fakt: ein Song hat oft nur wenige Strophen-Einblendungen
  facts.splice(1, 0, ...similarFact(song));
  if (!facts.length || t % FACT_PERIOD_MS >= FACT_VISIBLE_MS) return null;
  // laufende Nummer nur über Einblendungen, die in Strophen fallen – so kommt jeder Fakt an die Reihe
  const k = Math.floor(t / FACT_PERIOD_MS);
  const sections = song.lyrics?.sections ?? [];
  const inVerse = (ms: number) => sections.some((x) => x.kind === "verse" && x.startMs <= ms && ms < x.endMs);
  let ordinal = 0;
  for (let i = 0; i < k; i++) if (inVerse(i * FACT_PERIOD_MS)) ordinal++;
  return facts[ordinal % facts.length]!;
}

/** Höchstens so viele Fotos im Wechsel auf der Wand (jedes wird einmal geladen) */
export const WALL_PHOTOS_MAX = 8;

/**
 * Fotos für die LED-Wand: alle Artists des Songs (Lead zuerst), je Quelle abwechselnd (das Wikipedia-Foto kommt nicht
 * erst nach vier Bühnenbildern), bestes Querformat vorn. Hochformat nur, wenn es nichts anderes gibt – auf der breiten
 * Wand bliebe davon nur ein Streifen.
 */
export function wallPhotos(song: SongStatic): Photo[] {
  const all = song.info?.photos ?? [];
  const wide = all.filter((p) => aspect(p) >= 0.95);
  const pool = wide.length ? wide : all;
  const order = song.artists.map((a) => a.spotifyId);
  const rank = (id: string | undefined) => (id && order.includes(id) ? order.indexOf(id) : order.length);
  const byArtist = [...new Set(pool.map((p) => p.artistId))].sort((a, b) => rank(a) - rank(b));
  return byArtist
    .flatMap((id) =>
      diversify(
        rankPhotos(
          pool.filter((p) => p.artistId === id),
          "wall",
        ),
      ),
    )
    .slice(0, WALL_PHOTOS_MAX);
}

/** Foto für die LED-Wand zum Zeitpunkt t: wechselt mit jedem Abschnitt (ohne Songtext jede Minute). */
export function wallPhotoAt(song: SongStatic, t = 0): Photo | null {
  const list = wallPhotos(song);
  if (!list.length) return null;
  const sections = song.lyrics?.sections ?? [];
  const idx = sections.length ? Math.max(0, sections.filter((s) => s.startMs <= t).length - 1) : Math.floor(t / 60_000);
  return list[idx % list.length]!;
}

/** Bildnachweis fürs Wandfoto („Foto: … · CC BY-SA 4.0“); eigene Demo-Bilder (lokale Pfade) brauchen keinen */
export function wallPhotoCredit(song: SongStatic, t = 0): string | null {
  const p = wallPhotoAt(song, t);
  return p && p.source !== "demo" && !p.url.startsWith("/") ? `Foto: ${p.credit} · ${p.license}` : null;
}

/** Bisherige Schnittstelle: erstes Wandfoto. */
export function wallPhoto(song: SongStatic): Photo | null {
  return wallPhotoAt(song, 0);
}

/** Belegt gerade eine Karte (Info oder Konzerte) den unteren Bereich? */
export function cardShownAt(song: SongStatic, d: Derived, t: number): boolean {
  return !!(infoCardAt(song, d, t) ?? concertCardAt(song, d, t));
}
