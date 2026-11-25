"use client";

import { ScrollPage } from "../ScrollPage";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CommandInput, Snapshot } from "@/lib/song-context/snapshot";
import { THEMES, themeIds, type EffectKind } from "@/lib/stage/themes";

const EFFECT_LABEL: Record<EffectKind, string> = {
  konfetti: "Konfetti",
  feuerwerk: "Feuerwerk",
  flammen: "Flammen",
  pyro: "Funkenfontänen",
  funken: "Kalte Funken",
  co2: "CO₂-Nebel",
  schaum: "Schaum",
  ringe: "Lichtringe",
  glitzer: "Spiegelkugel",
  sternschnuppen: "Sternschnuppen",
  luftschlangen: "Luftschlangen",
};

/** So oft liest die Fernbedienung den Stand; seltener hält sie den schnellen Befehlsabruf des Kiosks wach */
const READ_MS = 4000;
const ALIVE_MS = 30_000;
/** Meldet der Bildschirm sich so lange nicht, gilt er als nicht verbunden */
const STALE_MS = 75_000;

/** Ein Befehl verlängert ebenfalls den schnellen Abruf des Kiosks (siehe /api/remote) */
function markAlive(ref: { current: number }) {
  ref.current = Date.now();
}

const time = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

/**
 * Fernbedienung fürs Handy: Wiedergabe (direkt über Spotify), Effekte auf Knopfdruck, Bühne, Lampen, Lyrics-Versatz
 * und Bildschirm (über den Befehlskanal zum Kiosk – solange diese Seite offen ist, kommen Befehle in etwa 2 s an).
 */
export function RemotePage() {
  const [state, setState] = useState<"laden" | "login" | "bereit">("laden");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastAlive = useRef(0);
  const msgTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const read = useCallback(async () => {
    const alive = Date.now() - lastAlive.current >= ALIVE_MS;
    try {
      const r = await fetch(`/api/remote${alive ? "?alive=1" : ""}`, { cache: "no-store" });
      if (r.status === 401) return setState("login");
      if (!r.ok) return;
      if (alive) lastAlive.current = Date.now();
      setSnap(((await r.json()) as { snapshot: Snapshot | null }).snapshot);
      setState("bereit");
    } catch {
      /* nächster Versuch */
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void read(), 0);
    const id = setInterval(() => void read(), READ_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
      clearInterval(tick);
    };
  }, [read]);

  const flash = (text: string, error = false) => {
    setMessage({ text, error });
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMessage(null), 3000);
  };

  const send = async (command: CommandInput, done: string) => {
    try {
      const r = await fetch("/api/remote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Senden fehlgeschlagen");
      markAlive(lastAlive);
      flash(done);
    } catch (e) {
      flash((e as Error).message, true);
    }
  };

  const player = async (action: "play" | "pause" | "next" | "previous") => {
    try {
      const r = await fetch(`/api/player/${action}`, { method: "POST" });
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Spotify reagiert nicht");
      setTimeout(() => void read(), 1500);
    } catch (e) {
      flash((e as Error).message, true);
    }
  };

  const connected = !!snap && now - snap.updatedAt < STALE_MS;
  const position = snap ? Math.min(snap.durationMs, snap.positionMs + (snap.isPlaying ? now - snap.updatedAt : 0)) : 0;
  const btn =
    "min-h-14 rounded-2xl bg-white/10 px-4 text-lg font-semibold text-white active:scale-95 active:bg-white/25 disabled:opacity-40";
  const chip = (active: boolean) =>
    `min-h-12 rounded-full px-4 text-base font-semibold active:scale-95 ${active ? "bg-white text-black" : "bg-white/10 text-white"}`;

  return (
    <ScrollPage>
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 py-6 text-white" data-testid="remote">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Fernbedienung</h1>
          <span
            className={`rounded-full px-3 py-1 text-sm ${connected ? "bg-emerald-600/40" : "bg-white/10 text-white/60"}`}
            data-testid="remote-connected"
            data-connected={connected}
          >
            {connected ? "Bildschirm verbunden" : "Bildschirm nicht aktiv"}
          </span>
        </header>

        {message && (
          <p
            role="status"
            className={`sticky top-2 z-10 rounded-xl p-3 ${message.error ? "bg-red-700/95" : "bg-emerald-700/95"}`}
            data-testid="remote-message"
          >
            {message.text}
          </p>
        )}

        {state === "login" && (
          <p className="rounded-xl bg-white/10 p-4">
            Bitte zuerst{" "}
            <a href="/api/auth/login" className="font-bold text-[#1ed760] underline">
              mit Spotify anmelden
            </a>{" "}
            – mit demselben Konto wie der Bildschirm.
          </p>
        )}

        {state === "bereit" && (
          <>
            <section className="rounded-2xl bg-white/5 p-4" data-testid="remote-song">
              {snap ? (
                <>
                  <p className="truncate text-xl font-bold">{snap.title}</p>
                  <p className="truncate text-white/70">{snap.artists.map((a) => a.name).join(", ")}</p>
                  <div className="mt-3 h-1.5 rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-white/70"
                      style={{ width: `${Math.round((position / snap.durationMs) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-sm tabular-nums text-white/50">
                    {time(position)} / {time(snap.durationMs)}
                  </p>
                </>
              ) : (
                <p className="text-white/70">Gerade läuft nichts.</p>
              )}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button type="button" className={btn} onClick={() => void player("previous")} aria-label="Vorheriger Song">
                  ⏮
                </button>
                <button
                  type="button"
                  className={btn}
                  onClick={() => void player(snap?.isPlaying ? "pause" : "play")}
                  aria-label={snap?.isPlaying ? "Pause" : "Abspielen"}
                >
                  {snap?.isPlaying ? "⏸" : "▶"}
                </button>
                <button type="button" className={btn} onClick={() => void player("next")} aria-label="Nächster Song">
                  ⏭
                </button>
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4" aria-labelledby="effekte">
              <h2 id="effekte" className="text-lg font-bold">
                Effekt jetzt
              </h2>
              {snap?.stage && connected ? (
                <div className="grid grid-cols-2 gap-2" data-testid="remote-effects">
                  {snap.stage.effects.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={btn}
                      onClick={() => void send({ type: "effekt", kind: k }, `${EFFECT_LABEL[k]}!`)}
                    >
                      {EFFECT_LABEL[k]}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-white/60">Erscheint, sobald auf dem Bildschirm ein Song läuft.</p>
              )}
            </section>

            <section className="flex flex-col gap-3 rounded-2xl bg-white/5 p-4" aria-labelledby="buehne">
              <h2 id="buehne" className="text-lg font-bold">
                Bühne {snap?.stage && <span className="font-normal text-white/60">· jetzt {THEMES[snap.stage.id].label}</span>}
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={chip(false)}
                  onClick={() => void send({ type: "buehne", value: "auto" }, "Bühne: automatisch")}
                >
                  Automatisch
                </button>
                {themeIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={chip(snap?.stage?.id === id)}
                    onClick={() => void send({ type: "buehne", value: id }, `Bühne: ${THEMES[id].label}`)}
                  >
                    {THEMES[id].label}
                  </button>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3 rounded-2xl bg-white/5 p-4" aria-label="Licht, Lyrics und Bildschirm">
              <h2 className="col-span-2 text-lg font-bold">Licht · Lyrics · Bildschirm</h2>
              <button type="button" className={btn} onClick={() => void send({ type: "lampen", on: true }, "Lampen an")}>
                Lampen an
              </button>
              <button type="button" className={btn} onClick={() => void send({ type: "lampen", on: false }, "Lampen aus")}>
                Lampen aus
              </button>
              <button type="button" className={btn} onClick={() => void send({ type: "strobo", on: true }, "Stroboskop erlaubt")}>
                Strobo an
              </button>
              <button type="button" className={btn} onClick={() => void send({ type: "strobo", on: false }, "Stroboskop aus")}>
                Strobo aus
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => void send({ type: "versatz", deltaMs: -100 }, "Lyrics 0,1 s früher")}
              >
                Lyrics früher
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => void send({ type: "versatz", deltaMs: 100 }, "Lyrics 0,1 s später")}
              >
                Lyrics später
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => void send({ type: "bildschirm", on: false }, "Bildschirm aus")}
              >
                Bildschirm aus
              </button>
              <button type="button" className={btn} onClick={() => void send({ type: "bildschirm", on: true }, "Bildschirm an")}>
                Bildschirm an
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => void send({ type: "foto" }, "Foto! QR-Code erscheint auf dem Bildschirm")}
              >
                📸 Foto
              </button>
            </section>

            <p className="text-sm text-white/50">
              Wiedergabe geht direkt an Spotify. Alles andere erreicht den Bildschirm in etwa zwei Sekunden, solange diese Seite
              offen ist (der erste Befehl kann bis zu 15 Sekunden brauchen).{" "}
              <Link href="/einstellungen" className="underline">
                Einstellungen
              </Link>
            </p>
          </>
        )}
      </main>
    </ScrollPage>
  );
}
