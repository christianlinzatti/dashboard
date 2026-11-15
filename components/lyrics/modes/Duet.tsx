"use client";

import type { SecondLine } from "@/lib/lyrics/second-line";
import type { LyricLine, SongStatic } from "@/lib/song-context/schema";
import { Karaoke } from "./Karaoke";
import { SecondLineView } from "./SecondLineView";

/** Duett: Sänger links/rechts in ihren Farben; der gerade Singende ist hell, der andere zeigt seine letzte Zeile. */
export function Duet({
  song,
  lines,
  lineIdx,
  current,
  wordIdx,
  gap,
  second,
}: {
  song: SongStatic;
  lines: LyricLine[];
  lineIdx: number;
  current?: LyricLine;
  wordIdx: number;
  gap: React.ReactNode;
  second: SecondLine | null;
}) {
  const singers = song.lyrics?.singers ?? {};
  const agents = [...new Set(lines.map((l) => l.agent).filter((a): a is string => !!a && !!singers[a]))].slice(0, 2);
  // nur bereits begonnene Zeilen (vor der ersten Zeile: nichts)
  const lastOf = (agent: string) => [...lines.slice(0, lineIdx + 1)].reverse().find((l) => l.agent === agent);
  return (
    <div className="grid w-full grid-cols-2 items-end gap-[4vmin]" data-testid="lyrics-duet">
      {agents.map((agent, side) => {
        const artist = song.artists.find((a) => a.spotifyId === singers[agent]);
        const active = current?.agent === agent;
        const line = active ? current : lastOf(agent);
        return (
          <div
            key={agent}
            className={`flex flex-col gap-[1vmin] ${side === 0 ? "items-start text-left" : "items-end text-right"}`}
          >
            <span
              className="rounded-full px-3 py-0.5 text-[clamp(11px,1.9vmin,20px)] font-bold text-black"
              style={{ background: artist?.color, opacity: active ? 1 : 0.4 }}
            >
              {artist?.name}
            </span>
            {active && current ? (
              <div className="[&>p]:text-[clamp(24px,5.6vmin,72px)]">
                <Karaoke line={current} wordIdx={wordIdx} color={artist?.color ?? song.album.palette.accent} />
                {second && <SecondLineView line={current} second={second} color={artist?.color ?? song.album.palette.accent} />}
              </div>
            ) : (
              <p className="text-[clamp(16px,3.4vmin,40px)] font-semibold text-white/30">{line?.text ?? ""}</p>
            )}
          </div>
        );
      })}
      {!current && <div className="col-span-2">{gap}</div>}
    </div>
  );
}
