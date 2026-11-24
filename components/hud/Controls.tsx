"use client";

import { useStore } from "zustand";
import { offsetStore } from "@/lib/lyrics/offset-store";
import Link from "next/link";
import { QrCode } from "../concerts/QrCode";
import { useEffect, useRef, useState } from "react";
import { useSongContext } from "@/lib/song-context/store";
import { POLL_NOW_EVENT } from "../spotify/useSpotifySync";
import type { MicState } from "@/lib/song-context/schema";
import { useSettings } from "@/lib/settings";
import { photoStore } from "@/lib/photo/store";
import { hasSecondLine, secondLineLabel, secondLineModes } from "@/lib/lyrics/second-line";
import { useBridgeState } from "../bridge/useBridge";
import type { Quality } from "@/lib/stage/quality";
import { THEMES, themeIds, type ThemeChoice } from "@/lib/stage/themes";

const STAGE_CYCLE: ThemeChoice[] = ["auto", ...themeIds];

const QUALITY_CYCLE: Array<Quality | "auto"> = ["auto", "niedrig", "mittel", "hoch"];
const qualityLabel: Record<Quality | "auto", string> = { auto: "Auto", niedrig: "Niedrig", mittel: "Mittel", hoch: "Hoch" };

const HIDE_AFTER_MS = 6000;

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
  const [remoteQr, setRemoteQr] = useState<string | null>(null);
  const isPlaying = useSongContext((s) => s.playback.isPlaying);
  const offset = useSongContext((s) => s.playback.offsetMs);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const quality = useSettings((s) => s.quality);
  const strobe = useSettings((s) => s.strobe);
  const stage = useSettings((s) => s.stage);
  const secondLine = useSettings((s) => s.secondLine);
  const secondAvailable = useSongContext((s) => hasSecondLine(s.song?.lyrics));
  const lamps = useSettings((s) => s.lamps);
  const canvas = useSettings((s) => s.canvas);
  const bridge = useBridgeState((s) => s.state);
  const setSettings = useSettings((s) => s.set);

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

  // von Hand verschieben; die automatische Korrektur (Mikrofon) kommt dazu
  const changeOffset = (delta: number) => offsetStore.getState().changeManual(delta);
  const auto = useStore(offsetStore, (s) => s.device + s.song);

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
      {remoteQr && (
        <button
          type="button"
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-[2vmin] bg-black/85 text-white"
          onClick={() => setRemoteQr(null)}
          data-testid="remote-qr"
        >
          <QrCode text={remoteQr} size="min(42vmin, 360px)" label="QR-Code zur Fernbedienung" />
          <span className="text-[clamp(16px,3vmin,30px)] font-bold">Mit dem Handy scannen</span>
          <span className="text-[clamp(12px,2vmin,20px)] text-white/60">
            {remoteQr.replace(/^https?:\/\//, "")} · mit demselben Spotify-Konto anmelden · antippen zum Schließen
          </span>
        </button>
      )}
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
            {auto !== 0 && (
              <span className="ml-1 text-white/50" data-testid="offset-auto">
                (auto {auto >= 0 ? "+" : "−"}
                {(Math.abs(auto) / 1000).toFixed(1).replace(".", ",")})
              </span>
            )}
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
        {live && (
          <button
            className={btn}
            data-testid="canvas-toggle"
            aria-pressed={canvas}
            onClick={() => setSettings({ canvas: !canvas })}
            title="Spotify Canvas (Loop-Video des Künstlers) statt der Bühne"
          >
            Canvas {canvas ? "an" : "aus"}
          </button>
        )}
        <button className={btn} data-testid="photo-button" onClick={() => photoStore.getState().request()}>
          📸 Foto
        </button>
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
          <button className={btn} onClick={() => setRemoteQr(location.origin + "/fernbedienung")} data-testid="remote-qr-toggle">
            Handy als Fernbedienung
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
