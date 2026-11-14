import { Dashboard } from "@/components/Dashboard";
import { lyricsModes, type LyricsMode } from "@/lib/lyrics/director";
import { qualities, type Quality } from "@/lib/stage/quality";

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
      lyricsMode={lyricsModes.includes(one(sp.lyrics) as LyricsMode) ? (one(sp.lyrics) as LyricsMode) : undefined}
    />
  );
}
