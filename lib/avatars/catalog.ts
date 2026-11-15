import manifest from "@/avatars/manifest.json";

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

/** Alle Avatare aus /avatars/manifest.json (optimierte GLBs liegen unter /public/avatars). */
export const avatars: AvatarInfo[] = manifest.map((m) => {
  const id = m.file.replace(/\.glb$/, "");
  return {
    id,
    name: displayName(id),
    // Version aus der Prüfsumme: Avatare werden ein Jahr „immutable“ gecacht – ein Update braucht eine neue Adresse
    url: `/avatars/${m.file}?v=${m.sha256.slice(0, 12)}`,
    preview: `/avatars/${id}.png`,
    clips: m.clips.map((c) => c.name),
  };
});

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
