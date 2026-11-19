import { z } from "zod";
import type { SongStatic } from "@/lib/song-context/schema";
import { avatarById } from "./catalog";
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
  }
  return changed ? { artists, cast } : null;
}
