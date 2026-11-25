"use client";

import type { EveningPhase } from "@/lib/show/evening";
import { useEffect, useMemo } from "react";
import { avatars } from "@/lib/avatars/catalog";
import { mixamoIdsIn } from "@/lib/dance/mixamo-loader";
import { planChoreography } from "@/lib/dance/plan";
import { useSettings } from "@/lib/settings";
import { isBigNight } from "@/lib/show/evening";
import { useSongContext } from "@/lib/song-context/store";
import { planBand } from "@/lib/stage/band";
import { planEffects } from "@/lib/stage/effects";
import { signTexts } from "@/lib/stage/fan-signs";
import { setlistStore, useEveningPhase, usePreviousTheme, useRecentClipsKey, useTourTheme } from "@/lib/stage/setlist";
import { stageInfo } from "@/lib/stage/stage-info";
import { THEMES, themedPalette, themeFor, type Theme, type ThemeId } from "@/lib/stage/themes";

/**
 * Was auf der Bühne passiert, bevor gerendert wird: Bühne (Thema, Tour-Look), Choreografie, Abendphase, Band,
 * Fan-Schilder, Spezialeffekte – und das Gedächtnis des Abends (Setlist) sowie die Bühnen-Info für die Fernbedienung.
 */
export function useStagePlan(forceTheme?: ThemeId, forceEvening?: EveningPhase) {
  const raw = useSongContext((s) => s.song);
  // Bühnen-Thema: URL > Einstellung > Genre/Track; die Cover-Palette wird in Richtung Thema verschoben
  const themeChoice = useSettings((s) => s.stage);
  // Gedächtnis des Abends: Bühne des vorigen Songs meiden, Tänze der letzten Songs seltener
  const prevTheme = usePreviousTheme(raw?.trackKey);
  const recentKey = useRecentClipsKey(raw?.trackKey);
  const tour = useTourTheme(raw?.artists[0]?.spotifyId, raw?.trackKey);
  const theme: Theme | null = raw ? THEMES[forceTheme ?? themeFor(raw, themeChoice, prevTheme, tour)] : null;
  const song = useMemo(
    () => (raw && theme?.tint ? { ...raw, album: { ...raw.album, palette: themedPalette(raw.album.palette, theme) } } : raw),
    [raw, theme],
  );
  const bpm = useSongContext((s) => Math.round(s.live.bpm));
  const frozen = useSongContext((s) => s.frozen);
  const dark = song?.album.palette.dark ?? "#0b0712";

  // Neu planen nur, wenn sich Song, Abschnitte, Besetzung oder Tempo ändern
  const sectionsKey = song?.lyrics?.sections.map((s) => `${s.kind}${s.startMs}`).join() ?? "";
  // gefolgte Artists winken beim Songstart – die Daten kommen kurz nach dem Songwechsel
  const followKey = Object.entries(song?.user?.artists ?? {})
    .filter(([, a]) => a.following)
    .map(([id]) => id)
    .join();
  // Regie (Genres, Stimmung, KI-Brief, Tagesform) kommt kurz nach dem Songwechsel
  const showKey = `${raw?.variant}|${raw?.music.mood}|${raw?.music.genres.join()}|${raw?.show?.motto}|${raw?.memory?.drops.map((d) => d.ms).join()}|${raw?.memory?.energySeen ?? 0}`;
  const choreo = useMemo(
    () => (raw ? planChoreography(raw, bpm, { avoidClips: new Set(recentKey ? recentKey.split(",") : []) }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bewusst nur bei inhaltlichen Änderungen
    [raw?.trackKey, sectionsKey, bpm, raw?.cast, followKey, showKey, recentKey],
  );
  // Spannungsbogen des Abends (aufgezeichnet von useEveningTracker im Dashboard – auch ohne 3D-Szene)
  const tracked = useEveningPhase(raw?.trackKey, raw?.show?.mood ?? raw?.music.mood);
  // Demos und Screenshots können die Abendphase vorgeben (?abend=zugabe)
  const phase = forceEvening ?? tracked;
  // Bühne und getanzte Clips dieses Songs fürs Gedächtnis des Abends ergänzen
  useEffect(() => {
    if (!choreo || !theme) return;
    const clips = [...new Set(choreo.phrases.flatMap((p) => Object.values(p.moves).map((m) => m.clip)))];
    setlistStore.getState().record({ trackKey: choreo.trackKey, theme: theme.id, clips, artistId: raw?.artists[0]?.spotifyId });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Künstler gehört zum Song (choreo)
  }, [choreo, theme]);
  // Durchatmen nach mehreren wilden Songs: das Publikum holt die Feuerzeuge raus
  const shown = useMemo(
    () => (choreo && phase === "durchatmen" ? { ...choreo, crowdStyle: "ballade" as const } : choreo),
    [choreo, phase],
  );
  // Band hinten (DJ / Rock / Keys nach Genre) – nicht auf der niedrigsten Qualitätsstufe
  const band = useMemo(
    () =>
      raw
        ? planBand(
            raw,
            avatars.map((a) => a.id),
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei Song, Besetzung oder Regie neu
    [raw?.trackKey, raw?.cast, showKey],
  );
  // Fan-Schilder (Künstler, Titel, Heimatort …) – nur Texte; neu bei neuem Song oder Heimatort
  const signs = useMemo(
    () => (raw ? signTexts(raw) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nur bei Song oder Heimatort neu
    [raw?.trackKey, raw?.concertArea?.name],
  );
  const mixamoIds = useMemo(
    () => [
      ...new Set([
        ...(choreo ? mixamoIdsIn(choreo) : []),
        ...(band?.members.map((m) => m.clip).filter((c) => c.startsWith("Mixamo_")) ?? []),
      ]),
    ],
    [choreo, band],
  );
  const cues = useMemo(
    () => (choreo && theme ? planEffects(choreo, theme, { bigNight: isBigNight(phase) }) : []),
    [choreo, theme, phase],
  );
  // Fernbedienung: welche Bühne steht und welche Effekte sie hat
  useEffect(() => {
    stageInfo.getState().set(theme ? { id: theme.id, effects: theme.effects } : null);
  }, [theme]);
  useEffect(() => () => stageInfo.getState().set(null), []);
  return { raw, theme: theme as Theme | null, song, choreo, phase, shown, band, signs, mixamoIds, cues, frozen, dark };
}
