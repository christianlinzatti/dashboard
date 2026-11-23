"use client";

/* eslint-disable @next/next/no-img-element -- kleine, lokale Vorschaubilder; next/image bringt hier nichts */
import { useEffect, useState } from "react";
import { avatars } from "@/lib/avatars/catalog";
import { OUTFITS, outfitById } from "@/lib/avatars/outfits";
import { artistKey, type ArtistAvatars as Map } from "@/lib/avatars/overrides";
import { hats, type LookOverride } from "@/lib/avatars/look-override";

export type ArtistAvatarPatch = {
  artistAvatar: { name: string; avatarId: string | null; outfit?: string; trim?: string; look?: LookOverride };
};
type Save = (patch: ArtistAvatarPatch, done: string) => void;

const HAT_LABEL: Record<(typeof hats)[number] | "keiner", string> = {
  keiner: "Ohne",
  basecap: "Basecap",
  muetze: "Mütze",
  cowboyhut: "Cowboyhut",
  zylinder: "Zylinder",
  fischerhut: "Fischerhut",
};
const SIZES = [
  { label: "Klein", value: 0.92 },
  { label: "Normal", value: 1 },
  { label: "Groß", value: 1.1 },
] as const;
/** Leuchtfarben zur Auswahl (sonst die Künstlerfarbe) */
const TRIMS = ["#ff3d7f", "#ff9f1c", "#ffe066", "#4ade80", "#22d3ee", "#3b82f6", "#a855f7", "#ffffff"];

/** Kurzbeschreibung eines gespeicherten Looks */
function lookText(a: Map[string]) {
  const parts: string[] = [];
  if (a.look?.hat) parts.push(HAT_LABEL[a.look.hat] === "Ohne" ? "ohne Hut" : HAT_LABEL[a.look.hat]);
  if (a.look?.glasses !== undefined) parts.push(a.look.glasses ? "Brille" : "ohne Brille");
  if (a.look?.headphones !== undefined) parts.push(a.look.headphones ? "Kopfhörer" : "ohne Kopfhörer");
  if (a.look?.height !== undefined) parts.push(SIZES.find((s) => s.value === a.look!.height)?.label ?? "");
  return parts.filter(Boolean).join(" · ");
}

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
  const [trim, setTrim] = useState<string | undefined>(undefined);
  const [look, setLook] = useState<LookOverride>({});
  const change = (p: Partial<LookOverride>) =>
    setLook((l) => {
      const next = { ...l, ...p };
      for (const k of Object.keys(next) as Array<keyof LookOverride>) if (next[k] === undefined) delete next[k];
      return next;
    });
  /** Ja/Nein/Automatisch für Brille und Kopfhörer */
  const triState = (key: "glasses" | "headphones", label: string) => (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={label}>
      <span className="w-28 text-sm text-white/70">{label}</span>
      {(
        [
          ["Automatisch", undefined],
          ["Ja", true],
          ["Nein", false],
        ] as const
      ).map(([l, v]) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={look[key] === v}
          className={chip(look[key] === v)}
          onClick={() => change({ [key]: v })}
        >
          {l}
        </button>
      ))}
    </div>
  );
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
              <img
                src={`/avatars/${a.avatarId}.png`}
                alt=""
                className="size-12 rounded-lg bg-black/40 object-cover"
                style={a.trim ? { boxShadow: `0 0 0 3px ${a.trim}` } : undefined}
              />
              <span className="flex-1">
                <span className="font-semibold">{a.name}</span>
                <span className="block text-sm text-white/60">
                  {avatars.find((x) => x.id === a.avatarId)?.name}
                  {a.outfit ? ` · ${outfitById.get(a.outfit)?.label}` : ""}
                  {lookText(a) ? ` · ${lookText(a)}` : ""}
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
            {
              artistAvatar: {
                name: name.trim(),
                avatarId,
                ...(outfit ? { outfit } : {}),
                ...(trim ? { trim } : {}),
                ...(Object.keys(look).length ? { look } : {}),
              },
            },
            `${name.trim()} tritt jetzt als ${avatars.find((x) => x.id === avatarId)?.name} auf.`,
          );
          setName("");
          setAvatarId(null);
          setOutfit(undefined);
          setTrim(undefined);
          setLook({});
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

        <details className="rounded-xl bg-white/5 p-3" data-testid="avatar-kit">
          <summary className="cursor-pointer text-base font-semibold">Baukasten: Hut, Brille, Größe, Leuchtfarbe</summary>
          <div className="mt-3 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Kopfbedeckung">
              <span className="w-28 text-sm text-white/70">Kopfbedeckung</span>
              <button
                type="button"
                role="radio"
                aria-checked={!look.hat}
                className={chip(!look.hat)}
                onClick={() => change({ hat: undefined })}
              >
                Automatisch
              </button>
              {(["keiner", ...hats] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  role="radio"
                  aria-checked={look.hat === h}
                  className={chip(look.hat === h)}
                  onClick={() => change({ hat: h })}
                  data-testid={`hat-${h}`}
                >
                  {HAT_LABEL[h]}
                </button>
              ))}
            </div>
            {triState("glasses", "Sonnenbrille")}
            {triState("headphones", "Kopfhörer")}
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Größe">
              <span className="w-28 text-sm text-white/70">Größe</span>
              <button
                type="button"
                role="radio"
                aria-checked={look.height === undefined}
                className={chip(look.height === undefined)}
                onClick={() => change({ height: undefined })}
              >
                Automatisch
              </button>
              {SIZES.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  role="radio"
                  aria-checked={look.height === s.value}
                  className={chip(look.height === s.value)}
                  onClick={() => change({ height: s.value })}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Leuchtfarbe">
              <span className="w-28 text-sm text-white/70">Leuchtfarbe</span>
              <button type="button" role="radio" aria-checked={!trim} className={chip(!trim)} onClick={() => setTrim(undefined)}>
                Künstlerfarbe
              </button>
              {TRIMS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={trim === c}
                  aria-label={`Farbe ${c}`}
                  className={`size-11 rounded-full ${trim === c ? "ring-4 ring-white" : ""}`}
                  style={{ background: c }}
                  onClick={() => setTrim(c)}
                  data-testid={`trim-${c.slice(1)}`}
                />
              ))}
            </div>
          </div>
        </details>

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
