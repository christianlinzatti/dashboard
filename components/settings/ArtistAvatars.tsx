"use client";

/* eslint-disable @next/next/no-img-element -- kleine, lokale Vorschaubilder; next/image bringt hier nichts */
import { useEffect, useState } from "react";
import { avatars } from "@/lib/avatars/catalog";
import { OUTFITS, outfitById } from "@/lib/avatars/outfits";
import { artistKey, type ArtistAvatars as Map } from "@/lib/avatars/overrides";

type Save = (patch: { artistAvatar: { name: string; avatarId: string | null; outfit?: string } }, done: string) => void;

/** Vorschläge: Künstler des laufenden Songs und der zuletzt gehörten Songs (ohne Doppelte) */
function useSuggestions() {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const now = fetch("/api/song-context")
      .then((r) => (r.ok ? (r.json() as Promise<{ snapshot?: { artists?: Array<{ name: string }> } | null }>) : null))
      .then((d) => d?.snapshot?.artists?.map((a) => a.name) ?? [])
      .catch(() => [] as string[]);
    const recent = fetch("/api/recent")
      .then((r) => (r.ok ? (r.json() as Promise<{ tracks?: Array<{ artist: string }> }>) : null))
      .then((d) => d?.tracks?.map((t) => t.artist) ?? [])
      .catch(() => [] as string[]);
    void Promise.all([now, recent]).then(([a, b]) => {
      if (!alive) return;
      const seen = new Set<string>();
      setNames([...a, ...b].filter((n) => n && !seen.has(artistKey(n)) && !!seen.add(artistKey(n))).slice(0, 12));
    });
    return () => {
      alive = false;
    };
  }, []);
  return names;
}

/**
 * Eigener Avatar je Künstler: Künstler wählen (Vorschläge aus dem laufenden und den letzten Songs oder frei
 * eintippen), Avatar und Outfit antippen, speichern. Gilt ab dem nächsten Song auf allen Geräten.
 */
export function ArtistAvatars({ map, busy, save }: { map: Map; busy: boolean; save: Save }) {
  const suggestions = useSuggestions();
  const [name, setName] = useState("");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [outfit, setOutfit] = useState<string | undefined>(undefined);
  const saved = Object.values(map).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const ready = name.trim().length > 0 && !!avatarId;

  const chip = (active: boolean) =>
    `min-h-11 rounded-full px-4 text-base font-semibold ${active ? "bg-white text-black" : "bg-white/10 text-white"} disabled:opacity-50`;

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-white/5 p-5" aria-labelledby="avatare" data-testid="artist-avatars">
      <h2 id="avatare" className="text-xl font-bold">
        Avatare für Künstler
      </h2>

      {saved.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="artist-avatar-list">
          {saved.map((a) => (
            <li key={artistKey(a.name)} className="flex items-center gap-3 rounded-xl bg-white/5 p-2">
              <img src={`/avatars/${a.avatarId}.png`} alt="" className="size-12 rounded-lg bg-black/40 object-cover" />
              <span className="flex-1">
                <span className="font-semibold">{a.name}</span>
                <span className="block text-sm text-white/60">
                  {avatars.find((x) => x.id === a.avatarId)?.name}
                  {a.outfit ? ` · ${outfitById.get(a.outfit)?.label}` : ""}
                </span>
              </span>
              <button
                type="button"
                className="rounded-full px-3 py-2 text-white/70 underline"
                disabled={busy}
                onClick={() => save({ artistAvatar: { name: a.name, avatarId: null } }, `${a.name}: wieder automatisch.`)}
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          save(
            { artistAvatar: { name: name.trim(), avatarId, ...(outfit ? { outfit } : {}) } },
            `${name.trim()} tritt jetzt als ${avatars.find((x) => x.id === avatarId)?.name} auf.`,
          );
          setName("");
          setAvatarId(null);
          setOutfit(undefined);
        }}
      >
        <label htmlFor="artist" className="text-sm text-white/70">
          Künstler
        </label>
        <input
          id="artist"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name, z. B. Wanda"
          className="min-h-12 rounded-xl bg-white/10 px-4 text-lg placeholder:text-white/40"
          data-testid="artist-input"
        />
        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Vorschläge">
            {suggestions.map((n) => (
              <button key={n} type="button" className={chip(artistKey(n) === artistKey(name))} onClick={() => setName(n)}>
                {n}
              </button>
            ))}
          </div>
        )}

        <span className="text-sm text-white/70">Avatar</span>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Avatar">
          {avatars.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={avatarId === a.id}
              aria-label={a.name}
              className={`flex flex-col items-center gap-1 rounded-xl p-1 text-xs ${avatarId === a.id ? "bg-white text-black" : "bg-white/5"}`}
              onClick={() => setAvatarId(a.id)}
              data-testid={`avatar-${a.id}`}
            >
              <img src={a.preview} alt="" className="aspect-square w-full rounded-lg bg-black/40 object-cover" />
              <span className="line-clamp-1">{a.name}</span>
            </button>
          ))}
        </div>

        <span className="text-sm text-white/70">Outfit</span>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Outfit">
          <button
            type="button"
            role="radio"
            aria-checked={!outfit}
            className={chip(!outfit)}
            onClick={() => setOutfit(undefined)}
          >
            Automatisch
          </button>
          {OUTFITS.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={outfit === o.id}
              className={chip(outfit === o.id)}
              onClick={() => setOutfit(o.id)}
            >
              <span className="mr-2 inline-block size-3 rounded-full align-middle" style={{ background: o.suit }} />
              {o.label}
            </button>
          ))}
        </div>

        <button type="submit" className={`${chip(false)} self-start`} disabled={busy || !ready} data-testid="artist-save">
          Speichern
        </button>
      </form>
      <p className="text-sm text-white/50">
        Gilt auf allen Geräten mit diesem Spotify-Konto, ab dem nächsten Song. Andere Künstler bekommen ihren Avatar weiter
        automatisch.
      </p>
    </section>
  );
}
