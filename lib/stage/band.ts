import { hash } from "@/lib/avatars/casting";
import type { SongStatic } from "@/lib/song-context/schema";
import type { Vec2 } from "@/lib/dance/formations";

/**
 * Band hinter den Tänzern – je nach Genre: DJ am Pult (Techno/House/EDM), Gitarrist und Schlagzeuger (Rock),
 * Keyboarder (Jazz/Soul/Klassik/Ballade). Zusätzliche Avatare, die nicht zur tanzenden Crew gehören; sie stehen
 * hinten auf einem Podest und spielen im Takt. Deterministisch je Song.
 */
export type BandRole = "dj" | "gitarre" | "schlagzeug" | "keyboard";
export type BandKind = "dj" | "rock" | "keys";

export type BandMember = {
  role: BandRole;
  avatarId: string;
  /** Animation (eingebaut oder Mixamo); läuft auf 120 BPM normiert im Songtakt */
  clip: string;
  /** Platz auf der Bühne (x, z) – hinten, vor der Rückwand */
  position: Vec2;
};

export type Band = { kind: BandKind; members: BandMember[] } | null;

const KIND_RULES: Array<[RegExp, BandKind]> = [
  [/techno|house|edm|electro|trance|dubstep|drum ?(and|&|n) ?bass|hardstyle|club|rave/i, "dj"],
  [/rock|metal|punk|grunge|indie|garage|grunge|hardcore/i, "rock"],
  [/jazz|soul|blues|swing|klassik|classical|ballad|piano|singer.?songwriter|chanson|bossa/i, "keys"],
];

/** Wer spielt was, wo, mit welcher Animation; bevorzugte Avatare (passend zum Typ) zuerst */
const ROLES: Record<BandKind, Array<{ role: BandRole; clip: string; position: Vec2; prefer: string[] }>> = {
  dj: [{ role: "dj", clip: "Dance_Groove", position: [0, -2.25], prefer: ["neon-pulse", "quantum-bass", "chrome-beat"] }],
  rock: [
    { role: "schlagzeug", clip: "Mixamo_PlayingDrums", position: [0.75, -2.35], prefer: ["chrome-beat", "quantum-bass"] },
    { role: "gitarre", clip: "Mixamo_GuitarPlaying", position: [-1.6, -2.15], prefer: ["ember-rock", "festival-nova"] },
  ],
  keys: [{ role: "keyboard", clip: "Dance_HeelToe", position: [2.2, -2.15], prefer: ["velvet-jazz", "aurora-synth"] }],
};

export function bandKind(genres: readonly string[]): BandKind | null {
  for (const [re, kind] of KIND_RULES) if (genres.some((g) => re.test(g))) return kind;
  return null;
}

/**
 * Band für einen Song: Art nach Genre (Regie-Genres zuerst), Besetzung aus Avataren, die nicht schon tanzen.
 * Ohne passendes Genre oder ohne freie Avatare: keine Band.
 */
export function planBand(
  song: Pick<SongStatic, "trackKey" | "music" | "artists" | "cast"> & Partial<Pick<SongStatic, "show">>,
  allAvatars: readonly string[],
): Band {
  const genres = [...(song.show?.genres ?? []), ...song.music.genres, ...song.artists.flatMap((a) => a.genres ?? [])];
  const kind = bandKind(genres);
  if (!kind) return null;
  const taken = new Set(song.cast.map((c) => c.avatarId));
  const members: BandMember[] = [];
  for (const r of ROLES[kind]) {
    const free = allAvatars.filter((a) => !taken.has(a));
    const avatarId = r.prefer.find((p) => free.includes(p)) ?? free[hash(`${song.trackKey}:${r.role}`) % Math.max(free.length, 1)];
    if (!avatarId) break;
    taken.add(avatarId);
    members.push({ role: r.role, avatarId, clip: r.clip, position: r.position });
  }
  return members.length ? { kind, members } : null;
}
