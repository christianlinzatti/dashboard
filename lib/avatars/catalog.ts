import catalog from "./catalog.json";

export type AvatarInfo = {
  id: string;
  name: string;
  url: string;
  preview: string;
  clips: string[];
};

function displayName(id: string) {
  return id
    .split("-")
    .map((p) => p[0]!.toUpperCase() + p.slice(1))
    .join(" ");
}

/**
 * Alle Avatare aus dem kompakten Katalog (lib/avatars/catalog.json, erzeugt aus avatars/manifest.json durch
 * scripts/avatar-catalog.mjs – das volle Manifest mit Prüfsummen ist ~120 kB und gehört nicht in den Client).
 * Die Version in der Adresse kommt aus der Prüfsumme bzw. den Quellen der Figur: Avatare werden ein Jahr
 * „immutable“ gecacht, ein Update braucht eine neue Adresse.
 */
export const avatars: AvatarInfo[] = catalog.avatars.map((a) => ({
  id: a.id,
  name: displayName(a.id),
  url: `/avatars/${a.id}.glb?v=${a.v}`,
  preview: `/avatars/${a.id}.png`,
  clips: catalog.clipSets[a.c]!,
}));

export const avatarById = new Map(avatars.map((a) => [a.id, a]));

/** Clips, die alle Avatare besitzen – sicher für jede Besetzung. */
export const commonClips: string[] = avatars.reduce<string[]>(
  (acc, a) => acc.filter((c) => a.clips.includes(c)),
  avatars[0]?.clips ?? [],
);

/** Clips sind auf 120 BPM ausgelegt (2 s / 4 s = 4 / 8 Schläge). */
export const CLIP_BPM = 120;

export function timeScaleFor(bpm: number) {
  let s = bpm / CLIP_BPM;
  // Sehr schnelle/langsame Songs auf halbes/doppeltes Tempo falten
  while (s > 1.6) s /= 2;
  while (s < 0.6) s *= 2;
  return s;
}
