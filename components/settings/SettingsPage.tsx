"use client";

import { ScrollPage } from "../ScrollPage";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ArtistAvatars as AvatarMap, AvatarStyle } from "@/lib/avatars/overrides";
import { ArtistAvatars, type ArtistAvatarPatch } from "./ArtistAvatars";
import { AvatarStyleSection } from "./AvatarStyleSection";
import { QuietHoursSection } from "./QuietHoursSection";
import { CrowdSoundSection } from "./CrowdSoundSection";
import { useSettingsSync } from "./useSettingsSync";
import type { QuietHours } from "@/lib/live/quiet-hours";

type Area = { name: string; lat: number; lon: number; radiusKm: number; custom: boolean };
const RADII: Array<[number, string]> = [
  [50, "50 km"],
  [100, "100 km"],
  [200, "200 km"],
  [400, "400 km"],
  [20_000, "überall"],
];

/**
 * Einstellungen pro Spotify-Konto (gelten auf allen Geräten). Gedacht auch fürs Handy:
 * dieselbe Adresse öffnen, anmelden, Heimatort eintippen – der Kiosk übernimmt ihn beim nächsten Song.
 */
export function SettingsPage() {
  const [area, setArea] = useState<Area | null>(null);
  const [state, setState] = useState<"laden" | "bereit" | "login" | "speichert">("laden");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [place, setPlace] = useState("");
  const [artistAvatars, setArtistAvatars] = useState<AvatarMap>({});
  const [quietHours, setQuietHours] = useState<QuietHours | null>(null);
  const [avatarStyle, setAvatarStyle] = useState<AvatarStyle>("gemischt");
  // Geräte-Einstellungen dieses Browsers mit dem Konto abgleichen (z. B. Publikumsgeräusche vom Handy aus)
  useSettingsSync(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/prefs")
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 401) return setState("login");
        const d = (await r.json()) as {
          area: Area;
          artistAvatars?: AvatarMap;
          quietHours?: QuietHours | null;
          avatarStyle?: AvatarStyle;
        };
        setArea(d.area);
        setAvatarStyle(d.avatarStyle ?? "gemischt");
        setArtistAvatars(d.artistAvatars ?? {});
        setQuietHours(d.quietHours ?? null);
        setState("bereit");
      })
      .catch(() => alive && setMessage({ text: "Einstellungen konnten nicht geladen werden.", error: true }));
    return () => {
      alive = false;
    };
  }, []);

  type Patch = {
    home?: string | null;
    radiusKm?: number | null;
    artistAvatar?: ArtistAvatarPatch["artistAvatar"];
    quietHours?: QuietHours | null;
    avatarStyle?: AvatarStyle;
  };
  const save = async (patch: Patch, done: string) => {
    setState("speichert");
    setMessage(null);
    try {
      const r = await fetch("/api/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const d = (await r.json()) as {
        area?: Area;
        artistAvatars?: AvatarMap;
        quietHours?: QuietHours | null;
        avatarStyle?: AvatarStyle;
        error?: string;
      };
      if (!r.ok || !d.area) throw new Error(d.error ?? "Speichern fehlgeschlagen.");
      setAvatarStyle(d.avatarStyle ?? "gemischt");
      setArea(d.area);
      setArtistAvatars(d.artistAvatars ?? {});
      setQuietHours(d.quietHours ?? null);
      setMessage({ text: done });
      setPlace("");
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    }
    setState("bereit");
  };

  const chip = (active: boolean) =>
    `min-h-12 rounded-full px-5 text-lg font-semibold ${active ? "bg-white text-black" : "bg-white/10 text-white"} disabled:opacity-50`;

  return (
    <ScrollPage>
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-8 text-white" data-testid="settings">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">Einstellungen</h1>
          <Link href="/" className="shrink-0 whitespace-nowrap rounded-full bg-white/10 px-4 py-2 font-semibold">
            Zum Dashboard
          </Link>
        </header>

        {message && (
          <p
            role="status"
            className={`sticky top-2 z-10 rounded-xl p-3 ${message.error ? "bg-red-700/95" : "bg-emerald-700/95"}`}
            data-testid="settings-message"
          >
            {message.text}
          </p>
        )}

        {state === "login" && (
          <p className="rounded-xl bg-white/10 p-4">
            Bitte zuerst{" "}
            <a href="/api/auth/login" className="font-bold text-[#1ed760] underline">
              mit Spotify anmelden
            </a>
            . Die Einstellungen gelten dann auf allen Geräten mit diesem Konto.
          </p>
        )}

        {area && (
          <section className="flex flex-col gap-4 rounded-2xl bg-white/5 p-5" aria-labelledby="konzerte">
            <h2 id="konzerte" className="text-xl font-bold">
              Konzerte in deiner Nähe
            </h2>
            <p className="text-lg" data-testid="current-area">
              {area.name} · {area.radiusKm >= 5000 ? "überall" : `${area.radiusKm} km`}
              {!area.custom && <span className="text-white/50"> (Standard)</span>}
            </p>

            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (place.trim().length >= 2) void save({ home: place.trim() }, "Heimatort gespeichert.");
              }}
            >
              <label className="sr-only" htmlFor="place">
                Heimatort
              </label>
              <input
                id="place"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="Heimatort, z. B. Linz"
                className="min-h-12 flex-1 rounded-xl bg-white/10 px-4 text-lg placeholder:text-white/40"
                autoComplete="address-level2"
                data-testid="place-input"
              />
              <button type="submit" className={chip(false)} disabled={state === "speichert" || place.trim().length < 2}>
                Übernehmen
              </button>
            </form>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Umkreis">
              {RADII.map(([km, label]) => (
                <button
                  key={km}
                  type="button"
                  className={chip(area.radiusKm === km)}
                  aria-pressed={area.radiusKm === km}
                  disabled={state === "speichert"}
                  onClick={() => void save({ radiusKm: km }, `Umkreis: ${label}.`)}
                >
                  {label}
                </button>
              ))}
            </div>

            {area.custom && (
              <button
                type="button"
                className="self-start text-white/70 underline"
                disabled={state === "speichert"}
                onClick={() => void save({ home: null, radiusKm: null }, "Auf Standard zurückgesetzt.")}
              >
                Auf Standard zurücksetzen
              </button>
            )}
            <p className="text-sm text-white/50">
              Gilt auf allen Geräten mit diesem Spotify-Konto, auch für Alexa. Das Dashboard übernimmt die Änderung beim nächsten
              Song. Orte werden über OpenStreetMap gesucht.
            </p>
          </section>
        )}

        {area && (
          <QuietHoursSection
            key={quietHours ? `${quietHours.from}-${quietHours.to}` : "aus"}
            value={quietHours}
            busy={state === "speichert"}
            save={(p, done) => void save(p, done)}
          />
        )}

        {area && <AvatarStyleSection value={avatarStyle} busy={state === "speichert"} save={(p, done) => void save(p, done)} />}

        {area && <ArtistAvatars map={artistAvatars} busy={state === "speichert"} save={(p, done) => void save(p, done)} />}

        <CrowdSoundSection />
      </main>
    </ScrollPage>
  );
}
