"use client";

import { useEffect } from "react";
import { applyArtistAvatars, type ArtistAvatars } from "@/lib/avatars/overrides";
import { songContext } from "@/lib/song-context/store";

/**
 * Eigene Avatare je Künstler (Einstellungen) auf den laufenden Song anwenden. Die Zuordnungen kommen beim Start und
 * bei jedem Songwechsel neu vom Server (am Handy geändert → gilt ab dem nächsten Song); bis dahin gilt der letzte
 * Stand sofort, damit der Avatar nicht erst nach dem Laden wechselt.
 */
export function useArtistAvatars(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let map: ArtistAvatars | undefined;
    let alive = true;
    const apply = () => {
      const s = songContext.getState();
      if (!s.song) return;
      const patch = applyArtistAvatars(s.song, map);
      if (patch) s.mergeSong(patch);
    };
    const load = () =>
      fetch("/api/prefs", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ artistAvatars?: ArtistAvatars }>) : null))
        .then((d) => {
          if (!alive || !d) return;
          map = d.artistAvatars;
          apply();
        })
        .catch(() => undefined);
    // neu laden bei jedem Song; anwenden auch, wenn die Besetzung später neu entsteht (idempotent)
    const unsubTrack = songContext.subscribe(
      (s) => s.song?.trackKey,
      (key) => {
        if (!key) return;
        apply();
        void load();
      },
      { fireImmediately: true },
    );
    const unsubCast = songContext.subscribe((s) => s.song?.cast.map((c) => c.avatarId).join(), apply);
    return () => {
      alive = false;
      unsubTrack();
      unsubCast();
    };
  }, [enabled]);
}
