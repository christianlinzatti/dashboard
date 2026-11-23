import { Dashboard } from "@/components/Dashboard";
import { lyricsEffects, lyricsModes, type LyricsEffect, type LyricsMode } from "@/lib/lyrics/director";
import { qualities, type Quality } from "@/lib/stage/quality";
import { themeIds, type ThemeId } from "@/lib/stage/themes";
import { quietHoursFromParam } from "@/lib/live/quiet-hours";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function Page({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const t = one(sp.t);
  return (
    <Dashboard
      demo={one(sp.demo)}
      t={t !== undefined && /^\d+$/.test(t) ? Number(t) : undefined}
      debug={one(sp.debug) === "1"}
      loginError={one(sp.fehler)}
      mic={one(sp.mic) === "1"}
      quality={qualities.includes(one(sp.qualitaet) as Quality) ? (one(sp.qualitaet) as Quality) : undefined}
      theme={themeIds.includes(one(sp.buehne) as ThemeId) ? (one(sp.buehne) as ThemeId) : undefined}
      lyricsEffect={lyricsEffects.includes(one(sp.effekt) as LyricsEffect) ? (one(sp.effekt) as LyricsEffect) : undefined}
      weather={(["regen", "schnee", "aus"] as const).find((w) => w === one(sp.wetter))}
      transition={(["umbau", "zugabe"] as const).find((w) => w === one(sp.uebergang))}
      quietHours={quietHoursFromParam(one(sp.ruhe))}
      avatars={one(sp.avatare)?.split(",").slice(0, 7)}
      avatarStyle={one(sp.stil) === "chibi" ? "chibi" : undefined}
      canvasDemo={one(sp.canvas)}
      lyricsMode={lyricsModes.includes(one(sp.lyrics) as LyricsMode) ? (one(sp.lyrics) as LyricsMode) : undefined}
    />
  );
}
