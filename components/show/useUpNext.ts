"use client";

import { useEffect } from "react";
import { avatarById } from "@/lib/avatars/catalog";
import { songContext } from "@/lib/song-context/store";
import type { SongStatic } from "@/lib/song-context/schema";
import { fixtures } from "@/lib/song-context/fixtures";
import { songFromTrack } from "@/lib/spotify/map";
import { spotifyTrackSchema } from "@/lib/spotify/types";
import { shouldFetchUpNext, upNextStore, type UpNext } from "@/lib/show/up-next";
import { lyricsUrl } from "@/components/lyrics/useLyricsLoader";
import { ensureArtistMeta } from "@/lib/spotify/artist-meta-client";

const summary = (s: SongStatic): UpNext => ({
  trackKey: s.trackKey,
  title: s.track.title,
  artists: s.artists.map((a) => a.name),
  ...(s.album.coverUrl ? { coverUrl: s.album.coverUrl } : {}),
});

/** Tanzdatei je Figur (aus dem Build-Manifest; einmal geholt) */
let tanzOf: Promise<Map<string, string>> | null = null;
function tanzFiles() {
  tanzOf ??= fetch("/avatars/manifest.json", { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<Array<{ url: string; tanz?: string }>>) : []))
    .then((list) => new Map(list.filter((e) => e.tanz).map((e) => [e.url, e.tanz!])))
    .catch(() => new Map<string, string>());
  return tanzOf;
}

/**
 * Nächsten Song vorladen: Lyrics (wärmt den Server-Cache), Figuren und ihre Tanzdateien (fertig ausgepackt im
 * Ladespeicher der Bühne) – beim Songwechsel stehen sie sofort bereit. Fehler sind egal (dann lädt es wie bisher).
 */
async function preload(song: SongStatic) {
  void fetch(lyricsUrl(song)).catch(() => undefined);
  // 3D-Bibliothek erst hier (gehört zum nachgeladenen Bühnen-Teil – läuft die Bühne, ist sie schon da)
  const [{ useGLTF }, tanz] = await Promise.all([import("@react-three/drei"), tanzFiles()]);
  for (const c of song.cast) {
    const info = avatarById.get(c.avatarId);
    if (!info) continue;
    useGLTF.preload(info.url);
    const t = tanz.get(info.url.split("?")[0]!);
    if (t) useGLTF.preload(`/avatars/${t}`);
  }
}

/**
 * „Gleich kommt …“: kurz vor Songende den nächsten Titel der Spotify-Warteschlange holen und vorladen. In Demos
 * kommt die nächste Demo der Liste (ohne Netz). Einmal je Song.
 */
export function useUpNext(opts: { live: boolean; demo?: string }) {
  const { live, demo } = opts;
  useEffect(() => {
    if (!live && !demo) return;
    let asked: string | null = null;
    const check = () => {
      const { song, positionMs } = songContext.getState();
      if (!song || asked === song.trackKey || !shouldFetchUpNext(song.track.durationMs, positionMs)) return;
      asked = song.trackKey;
      const current = song.trackKey;
      if (demo) {
        const keys = Object.keys(fixtures);
        const next = fixtures[keys[(keys.indexOf(demo) + 1) % keys.length]!];
        upNextStore.getState().set(current, next ? summary(next) : null);
        return;
      }
      fetch("/api/up-next", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ track: unknown }>) : { track: null }))
        .then(({ track }) => {
          const parsed = spotifyTrackSchema.safeParse(track);
          if (!parsed.success) return upNextStore.getState().set(current, null);
          const next = songFromTrack(parsed.data);
          upNextStore.getState().set(current, summary(next));
          void preload(next);
          // Genres der Künstler schon jetzt holen: beim Songstart werden die Figuren dann gleich nach Genre gewählt
          void ensureArtistMeta(next.artists);
        })
        .catch(() => undefined);
    };
    check();
    return songContext.subscribe(check);
  }, [live, demo]);
}
