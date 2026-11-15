"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { songContext, useSongContext } from "@/lib/song-context/store";
import { POLL_NOW_EVENT } from "../spotify/useSpotifySync";
import type { MicState } from "@/lib/song-context/schema";
import { useSettings } from "@/lib/settings";
import { hasSecondLine, secondLineLabel, secondLineModes } from "@/lib/lyrics/second-line";
import { useBridgeState } from "../bridge/useBridge";
import type { Quality } from "@/lib/stage/quality";
import { THEMES, themeIds, type ThemeChoice } from "@/lib/stage/themes";

const STAGE_CYCLE: ThemeChoice[] = ["auto", ...themeIds];

const QUALITY_CYCLE: Array<Quality | "auto"> = ["auto", "niedrig", "mittel", "hoch"];
const qualityLabel: Record<Quality | "auto", string> = { auto: "Auto", niedrig: "Niedrig", mittel: "Mittel", hoch: "Hoch" };

const OFFSET_KEY = "ss_lyrics_offset";
const HIDE_AFTER_MS = 6000;

function storedOffset(): number {
  try {
    return Number(localStorage.getItem(OFFSET_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Steuerleiste: erscheint nach Berührung, blendet nach 6 s wieder aus.
 * Play/Pause/Skip über Spotify, Lyrics-Offset (pro Gerät gespeichert), Abmelden.
 */
const micLabel: Record<MicState, string> = {
  aus: "Mikro an",
  startet: "Mikro startet …",
  aktiv: "Mikro aus",
  verweigert: "Mikro gesperrt",
  "nicht-verfuegbar": "Kein Mikro",
  fehler: "Mikro-Fehler",
};

export function Controls({ live, mic }: { live: boolean; mic?: { state: MicState; toggle: () => void } }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isPlaying = useSongContext((s) => s.playback.isPlaying);
  const offset = useSongContext((s) => s.playback.offsetMs);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const quality = useSettings((s) => s.quality);
  const strobe = useSettings((s) => s.strobe);
  const stage = useSettings((s) => s.stage);
  const secondLine = useSettings((s) => s.secondLine);
  const secondAvailable = useSongContext((s) => hasSecondLine(s.song?.lyrics));
  const lamps = useSettings((s) => s.lamps);
  const bridge = useBridgeState((s) => s.state);
  const setSettings = useSettings((s) => s.set);

  useEffect(() => {
    songContext.getState().setPlayback({ offsetMs: storedOffset() });
  }, []);

  useEffect(() => {
    const show = () => {
      setVisible(true);
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
    };
    window.addEventListener("pointerdown", show);
    return () => {
      window.removeEventListener("pointerdown", show);
      clearTimeout(hideTimer.current);
    };
  }, []);

  const changeOffset = (delta: number) => {
    const next = Math.round((songContext.getState().playback.offsetMs + delta) / 50) * 50;
    songContext.getState().setPlayback({ offsetMs: next });
    try {
      localStorage.setItem(OFFSET_KEY, String(next));
    } catch {
      /* privater Modus – Offset gilt dann nur für diese Sitzung */
    }
  };

  const player = async (action: "play" | "pause" | "next" | "previous") => {
    const res = await fetch(`/api/player/${action}`, { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => ({}));
      setMessage(body?.error ?? "Steuerung fehlgeschlagen.");
      setTimeout(() => setMessage(null), 4000);
    }
    window.dispatchEvent(new Event(POLL_NOW_EVENT));
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    location.reload(); // Abmelden gibt es nur im Live-Betrieb auf „/“
  };

  const btn =
    "grid min-h-12 min-w-12 place-items-center rounded-full bg-white/12 px-4 text-[clamp(14px,2.4vmin,24px)] font-semibold backdrop-blur active:bg-white/25";

  return (
    <>
      {message && (
        <div
          className="absolute left-1/2 top-[16vmin] z-40 -translate-x-1/2 rounded-full bg-black/80 px-5 py-2 text-[clamp(13px,2.2vmin,22px)]"
          role="status"
        >
          {message}
        </div>
      )}
      <div
        className={`absolute inset-x-0 bottom-[7vmin] z-30 flex flex-wrap items-center justify-center gap-3 px-4 transition-opacity duration-300 ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        data-testid="controls"
        aria-hidden={!visible}
      >
        {live && (
          <>
            <button className={btn} onClick={() => player("previous")} aria-label="Vorheriger Song">
              ⏮
            </button>
            <button
              className={btn}
              onClick={() => player(isPlaying ? "pause" : "play")}
              aria-label={isPlaying ? "Pause" : "Abspielen"}
            >
              {isPlaying ? "⏸" : "▶"}
            </button>
            <button className={btn} onClick={() => player("next")} aria-label="Nächster Song">
              ⏭
            </button>
          </>
        )}
        <div className="flex items-center gap-2 rounded-full bg-black/40 p-1 backdrop-blur">
          <button className={btn} onClick={() => changeOffset(-100)} aria-label="Lyrics früher">
            −
          </button>
          <span className="min-w-[9ch] text-center text-[clamp(12px,2vmin,20px)] tabular-nums" data-testid="offset">
            Lyrics {offset >= 0 ? "+" : "−"}
            {(Math.abs(offset) / 1000).toFixed(1).replace(".", ",")} s
          </span>
          <button className={btn} onClick={() => changeOffset(100)} aria-label="Lyrics später">
            +
          </button>
        </div>
        <button
          className={btn}
          data-testid="quality-toggle"
          onClick={() => setSettings({ quality: QUALITY_CYCLE[(QUALITY_CYCLE.indexOf(quality) + 1) % QUALITY_CYCLE.length]! })}
        >
          Qualität: {qualityLabel[quality]}
        </button>
        <button
          className={btn}
          data-testid="stage-toggle"
          onClick={() => setSettings({ stage: STAGE_CYCLE[(STAGE_CYCLE.indexOf(stage) + 1) % STAGE_CYCLE.length]! })}
        >
          Bühne: {stage === "auto" ? "Auto" : THEMES[stage].label}
        </button>
        {secondAvailable && (
          <button
            className={btn}
            data-testid="second-line-toggle"
            onClick={() =>
              setSettings({ secondLine: secondLineModes[(secondLineModes.indexOf(secondLine) + 1) % secondLineModes.length]! })
            }
          >
            2. Zeile: {secondLineLabel[secondLine]}
          </button>
        )}
        <button
          className={btn}
          data-testid="strobe-toggle"
          aria-pressed={strobe}
          onClick={() => setSettings({ strobe: !strobe })}
        >
          Strobo {strobe ? "an" : "aus"}
        </button>
        {live && (
          <button
            className={btn}
            data-testid="lamps-toggle"
            aria-pressed={lamps}
            title={bridge === "verbunden" ? "Pi-Bridge verbunden" : "Pi-Bridge nicht erreichbar"}
            onClick={() => setSettings({ lamps: !lamps })}
          >
            Lampen {lamps ? "an" : "aus"}
            {bridge !== "verbunden" && <span className="ml-2 text-[0.75em] text-white/50">(keine Bridge)</span>}
          </button>
        )}
        {mic && (
          <button className={btn} onClick={mic.toggle} data-testid="mic-toggle" aria-pressed={mic.state === "aktiv"}>
            {micLabel[mic.state]}
          </button>
        )}
        {live && (
          <Link className={btn} href="/einstellungen" data-testid="settings-link">
            Einstellungen
          </Link>
        )}
        {live && (
          <button className={btn} onClick={logout}>
            Abmelden
          </button>
        )}
      </div>
    </>
  );
}
