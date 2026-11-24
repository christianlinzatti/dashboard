"use client";

import { useEffect } from "react";
import { todayLocal } from "@/lib/concerts/display";
import { reminderStore, remindersFrom } from "@/lib/concerts/reminders";
import { songContext } from "@/lib/song-context/store";

/**
 * Merkt sich Konzerte im Umkreis von Künstlern, denen du folgst oder deren Song du magst (nur live, nicht in Demos).
 * Konzerte und Likes/Follows kommen getrennt an – deshalb bei jeder Änderung des Songs neu prüfen.
 */
export function useConcertReminders(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    return songContext.subscribe(
      (s) => s.song,
      (song) => {
        if (!song?.concerts?.length || !song.user) return;
        const today = todayLocal();
        reminderStore.getState().add(remindersFrom(song, today), today);
      },
      { fireImmediately: true },
    );
  }, [enabled]);
}
