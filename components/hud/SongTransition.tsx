"use client";

import { useEffect, useState } from "react";
import { mottoFor } from "@/lib/show/motto";
import { useSongContext } from "@/lib/song-context/store";
import { eveningPhaseFor, setlistStore } from "@/lib/stage/setlist";
import { artistLine } from "./labels";

export type TransitionKind = "umbau" | "zugabe";

/** Mindestdauer (die neue Bühne kann schneller bereit sein) und Höchstdauer (falls sie nie meldet) */
const MIN_MS: Record<TransitionKind, number> = { umbau: 2400, zugabe: 4200 };
const MAX_MS = 9000;

/** Bühnenbereitschaft (ReadySignal setzt das Attribut, sobald die neue Szene gerendert ist) */
const stageReady = () => document.body.getAttribute("data-stage-ready") === "true";

/**
 * Umbau zwischen zwei Songs: Licht aus, Nebel zieht, Lichtkegel suchen die Bühne ab, dazu der nächste Song mit Motto.
 * Nach einem ausgespielten Höhepunkt oder Lieblingssong ruft das Publikum „Zugabe!“ und hält die Handys hoch.
 * Blendet aus, sobald die neue Bühne steht (und die Mindestdauer um ist) – die Crew läuft dann gerade ein.
 * `force` zeigt den Übergang dauerhaft (Demo/Screenshots: ?uebergang=umbau|zugabe).
 */
export function SongTransition({ force }: { force?: TransitionKind }) {
  const song = useSongContext((s) => s.song);
  const key = song?.trackKey;
  const [seen, setSeen] = useState(key);
  const [active, setActive] = useState<{ key: string; kind: TransitionKind } | null>(null);
  const [hidden, setHidden] = useState<string | null>(null);

  // Songwechsel erkennen (nicht beim ersten Song des Abends)
  if (key !== seen) {
    setSeen(key);
    if (seen && key && song) {
      const mood = song.show?.mood ?? song.music.mood;
      const zugabe = eveningPhaseFor(setlistStore.getState().played, key, mood) === "zugabe";
      setActive({ key, kind: zugabe ? "zugabe" : "umbau" });
    }
  }

  useEffect(() => {
    if (!active || force) return;
    let minOver = false;
    const done = () => setHidden(active.key);
    const check = () => {
      if (minOver && stageReady()) done();
    };
    const tMin = setTimeout(() => {
      minOver = true;
      check();
    }, MIN_MS[active.kind]);
    const tMax = setTimeout(done, MAX_MS);
    const mo = new MutationObserver(check);
    mo.observe(document.body, { attributes: true, attributeFilter: ["data-stage-ready"] });
    return () => {
      clearTimeout(tMin);
      clearTimeout(tMax);
      mo.disconnect();
    };
  }, [active, force]);

  const kind = force ?? active?.kind;
  if (!song || !kind) return null;
  const visible = !!force || (!!active && hidden !== active.key);
  const zugabe = kind === "zugabe";

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden bg-black/90 transition-opacity duration-[900ms]"
      style={{ opacity: visible ? 1 : 0 }}
      data-testid="song-transition"
      data-kind={kind}
      data-visible={visible}
      aria-hidden={!visible}
    >
      {/* Nebel */}
      {[0, 1].map((i) => (
        <div
          key={i}
          className="transition-anim absolute -inset-[20%] blur-3xl"
          style={{
            background: `radial-gradient(ellipse 45% 30% at ${30 + i * 40}% ${70 - i * 15}%, color-mix(in srgb, var(--c-accent, #ff4fd8) 22%, transparent), transparent 70%)`,
            animation: `haze-drift ${9 + i * 4}s ease-in-out ${i * -3}s infinite alternate`,
          }}
        />
      ))}
      {/* zwei Lichtkegel von oben, die die dunkle Bühne absuchen */}
      {[
        { left: "22%", from: "-30deg", to: "18deg", dur: 3.4 },
        { left: "72%", from: "26deg", to: "-20deg", dur: 2.9 },
      ].map((b) => (
        <div
          key={b.left}
          className="transition-anim absolute top-[-10%] h-[130%] w-[22vmin] origin-top mix-blend-screen blur-md"
          style={
            {
              left: b.left,
              background: `linear-gradient(to bottom, color-mix(in srgb, var(--c-light, #fff) 55%, transparent), transparent 85%)`,
              clipPath: "polygon(42% 0, 58% 0, 100% 100%, 0 100%)",
              animation: `beam-sweep ${b.dur}s ease-in-out infinite alternate`,
              "--from": b.from,
              "--to": b.to,
            } as React.CSSProperties
          }
        />
      ))}
      {/* Zugabe: Handylichter im Publikum */}
      {zugabe && (
        <div
          className="transition-anim absolute inset-x-[-5%] bottom-0 h-[38%]"
          style={{
            backgroundImage: "radial-gradient(circle, rgb(240 246 255 / 0.95) 0 1.5px, transparent 3px)",
            backgroundSize: "3.4vmin 2.8vmin",
            maskImage: "linear-gradient(to top, black 30%, transparent)",
            animation: "phones-sway 2.2s ease-in-out infinite alternate",
          }}
        />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[6vmin] text-center">
        {zugabe ? (
          <div
            className="transition-anim text-[clamp(28px,9vmin,120px)] font-black uppercase leading-none tracking-wide"
            style={{
              color: "var(--c-accent, #ff4fd8)",
              textShadow: "0 0 0.4em var(--c-accent, #ff4fd8)",
              animation: "chant 1.1s ease-out infinite",
            }}
            data-testid="zugabe"
          >
            Zugabe! Zugabe!
          </div>
        ) : (
          <div className="text-[clamp(11px,1.8vmin,18px)] font-semibold uppercase tracking-[0.45em] text-white/55">
            Umbau · gleich geht&apos;s weiter
          </div>
        )}
        <div className="mt-[3vmin] text-[clamp(11px,1.8vmin,18px)] uppercase tracking-[0.3em] text-white/50">
          {zugabe ? "Als Zugabe" : "Als Nächstes"}
        </div>
        <div className="mt-[1vmin] max-w-[85%] text-balance text-[clamp(24px,6vmin,72px)] font-black leading-tight text-white">
          {song.track.title}
        </div>
        <div className="mt-[0.8vmin] text-[clamp(14px,2.6vmin,30px)] text-white/70">{artistLine(song)}</div>
        <div
          className="mt-[2.5vmin] max-w-[80%] text-balance text-[clamp(16px,3vmin,36px)] font-bold"
          style={{ color: "var(--c-light, #fff)", textShadow: "0 0 0.5em var(--c-accent, #ff4fd8)" }}
        >
          {mottoFor(song)}
        </div>
      </div>
    </div>
  );
}
