import { z } from "zod";
import type { SongStatic } from "@/lib/song-context/schema";
import { avatarById, avatars } from "./catalog";
import { hash, preferredAvatars } from "./casting";
import { lookOverrideSchema, trimColorSchema } from "./look-override";
import { outfitById } from "./outfits";

/**
 * Eigene Avatare für Künstler (Einstellungen): „Wanda tritt immer als Velvet Jazz in Gold auf“. Schlüssel ist der
 * Künstlername (klein, ohne Zusatzzeichen) – so passt er für Spotify, Last.fm und Alexa gleichermaßen.
 */
export const artistKey = (name: string) => name.normalize("NFKC").trim().toLocaleLowerCase("de-DE");

export const artistAvatarSchema = z.object({
  name: z.string().trim().min(1).max(120),
  avatarId: z.string().refine((id) => avatarById.has(id), "unbekannter Avatar"),
  outfit: z
    .string()
    .refine((id) => outfitById.has(id), "unbekanntes Outfit")
    .optional(),
  /** Avatar-Baukasten: Hut, Brille, Kopfhörer, Größe */
  look: lookOverrideSchema.optional(),
  /** Farbe der Leuchtstreifen (sonst die Künstlerfarbe) */
  trim: trimColorSchema.optional(),
});
export type ArtistAvatar = z.infer<typeof artistAvatarSchema>;

/** Höchstzahl gespeicherter Zuordnungen pro Konto */
export const MAX_ARTIST_AVATARS = 100;
export const artistAvatarsSchema = z
  .record(z.string().max(120), artistAvatarSchema)
  .refine((r) => Object.keys(r).length <= MAX_ARTIST_AVATARS, "zu viele Zuordnungen");
export type ArtistAvatars = z.infer<typeof artistAvatarsSchema>;

type CastSong = Pick<SongStatic, "artists" | "cast">;

/**
 * Zuordnungen auf einen Song anwenden: Künstler und ihre Plätze in der Besetzung bekommen den gewählten Avatar
 * (und ggf. das Outfit). Hat schon jemand anderes diesen Avatar, tauschen die beiden – jeder Avatar bleibt einmalig.
 * Liefert null, wenn sich nichts ändert (dann muss nichts gespeichert werden).
 */
export function applyArtistAvatars(song: CastSong, map: ArtistAvatars | undefined): CastSong | null {
  if (!map || !Object.keys(map).length) return null;
  const artists = song.artists.map((a) => ({ ...a }));
  const cast = song.cast.map((c) => ({ ...c }));
  let changed = false;
  for (const artist of artists) {
    const want = map[artistKey(artist.name)];
    if (!want) continue;
    const own = cast.find((c) => c.artistId === artist.spotifyId);
    const before = artist.avatarId;
    if (before !== want.avatarId) {
      // ein anderer Künstler mit fester Zuordnung behält seinen Avatar
      const holder = artists.find((a) => a !== artist && a.avatarId === want.avatarId);
      if (holder && map[artistKey(holder.name)]?.avatarId === want.avatarId) continue;
      if (holder) holder.avatarId = before;
      for (const c of cast)
        if (c !== own && c.avatarId === want.avatarId) c.avatarId = before;
      artist.avatarId = want.avatarId;
      if (own) own.avatarId = want.avatarId;
      changed = true;
    }
    if (own && want.outfit && own.outfit !== want.outfit) {
      own.outfit = want.outfit;
      changed = true;
    }
    if (own && want.trim && own.trim !== want.trim) {
      own.trim = want.trim;
      changed = true;
    }
    if (own && want.look && JSON.stringify(own.look) !== JSON.stringify(want.look)) {
      own.look = want.look;
      changed = true;
    }
  }
  return changed ? { artists, cast } : null;
}

/**
 * Demo und Screenshots: Besetzung der Reihe nach mit diesen Avataren (`?avatare=disco-baer,retro-bot`). Unbekannte
 * Namen bleiben weg; Künstler bekommen den Avatar ihres Platzes.
 */
export function castWith<T extends CastSong>(song: T, ids: readonly string[], known: ReadonlySet<string>): T {
  const valid = ids.filter((id) => known.has(id));
  if (!valid.length) return song;
  const cast = song.cast.map((c, i) => (valid[i] ? { ...c, avatarId: valid[i] } : c));
  const byArtist = new Map(cast.filter((c) => c.artistId).map((c) => [c.artistId!, c.avatarId]));
  const artists = song.artists.map((a) => ({ ...a, avatarId: byArtist.get(a.spotifyId) ?? a.avatarId }));
  return { ...song, cast, artists };
}

// ---------------------------------------------------------------- Avatar-Stil

export const avatarStyles = ["gemischt", "chibi"] as const;
export type AvatarStyle = (typeof avatarStyles)[number];

/** Alle Chibi-Figuren */
export const chibiIds = (): string[] => avatars.map((a) => a.id).filter((id) => id.startsWith("chibi-"));

/**
 * Avatar-Stil „nur Chibis“: Jede Figur auf der Bühne wird ein Chibi – passend zum Genre zuerst, Künstler stabil
 * (derselbe Künstler, derselbe Chibi), die Crew je Song. Jeder Chibi höchstens einmal. Eigene Zuordnungen aus den
 * Einstellungen gelten danach trotzdem (applyArtistAvatars). Liefert null, wenn schon alles passt.
 */
export function applyAvatarStyle(
  song: CastSong & { trackKey: string; music: { genres: string[] } },
  style: AvatarStyle | undefined,
  ids: readonly string[] = chibiIds(),
): CastSong | null {
  if (style !== "chibi" || !ids.length || song.cast.every((c) => ids.includes(c.avatarId))) return null;
  const preferred = preferredAvatars(song.music.genres).filter((id) => ids.includes(id));
  const used = new Set(song.cast.map((c) => c.avatarId).filter((id) => ids.includes(id)));
  const pick = (seed: string) => {
    const free = ids.filter((id) => !used.has(id));
    const pool = free.length ? free : [...ids];
    const fav = preferred.find((id) => pool.includes(id));
    const id = fav ?? pool[hash(seed) % pool.length]!;
    used.add(id);
    return id;
  };
  const byArtist = new Map<string, string>();
  const cast = song.cast.map((c) => {
    if (ids.includes(c.avatarId)) return c;
    const id = pick(c.artistId ? `chibi:${c.artistId}` : `chibi:${song.trackKey}:${c.position}`);
    if (c.artistId) byArtist.set(c.artistId, id);
    return { ...c, avatarId: id };
  });
  const artists = song.artists.map((a) => (byArtist.has(a.spotifyId) ? { ...a, avatarId: byArtist.get(a.spotifyId)! } : a));
  return { artists, cast };
}
