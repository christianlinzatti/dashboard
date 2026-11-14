import { avatars } from "./catalog";

/** Genre-Stichwort → bevorzugte Avatare (Reihenfolge = Priorität). */
const genreAffinity: Array<[RegExp, string[]]> = [
  [/rock|metal|punk|grunge/i, ["ember-rock", "chrome-beat"]],
  [/jazz|soul|blues|swing|funk/i, ["velvet-jazz", "sol-groove"]],
  [/latin|reggaeton|salsa|samba|bachata|afro/i, ["rio-carnival", "sol-groove"]],
  [/techno|house|edm|electro|trance|drum|bass/i, ["neon-pulse", "quantum-bass", "chrome-beat"]],
  [/hip ?hop|rap|trap|r&b/i, ["atlas-prism", "quantum-bass"]],
  [/festival|dance|schlager|party/i, ["festival-nova", "aurora-synth"]],
  [/pop|indie|singer/i, ["aurora-synth", "luna-flow", "sol-groove"]],
];

/** Deterministischer Hash (FNV-1a) – gleiche Eingabe, gleiche Besetzung. */
export function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function preferredAvatars(genres: string[]): string[] {
  const out: string[] = [];
  for (const g of genres)
    for (const [re, ids] of genreAffinity) if (re.test(g)) for (const id of ids) if (!out.includes(id)) out.push(id);
  return out;
}

/**
 * Wählt einen Avatar für einen Artist: zuerst genre-passend, sonst per Hash –
 * so bekommt derselbe Artist bei jedem Song denselben Avatar.
 */
export function avatarForArtist(artistId: string, genres: string[], taken: ReadonlySet<string> = new Set()): string {
  const free = avatars.map((a) => a.id).filter((id) => !taken.has(id));
  const pool = free.length ? free : avatars.map((a) => a.id);
  const preferred = preferredAvatars(genres).filter((id) => pool.includes(id));
  if (preferred.length) return preferred[hash(artistId) % preferred.length]!;
  return pool[hash(artistId) % pool.length]!;
}

export type CastInput = {
  trackKey: string;
  artists: Array<{ spotifyId: string; avatarId: string; role: "main" | "feature" }>;
  genres: string[];
  /** Gewünschte Gesamtzahl (Gerätestufe), Feature-Songs dürfen mehr haben */
  size?: number;
  maxSize?: number;
};

export type Cast = Array<{ avatarId: string; artistId?: string; role: "lead" | "feature" | "backup"; position: number }>;

/** Positionen von links nach rechts, Lead in der Mitte. */
function positionsFor(n: number): number[] {
  const order = [0, -1, 1, -2, 2, -3, 3];
  return order.slice(0, n);
}

/**
 * Besetzung für einen Song: ein Avatar pro Artist (Feature-Songs → mehrere Tänzer),
 * aufgefüllt mit genre-passenden Background-Tänzern, Seed = Track.
 */
export function buildCast({ trackKey, artists, genres, size = 3, maxSize = 5 }: CastInput): Cast {
  const target = Math.min(Math.max(size, artists.length), maxSize);
  const pos = positionsFor(target);
  const cast: Cast = [];
  const used = new Set<string>();

  for (const a of artists.slice(0, target)) {
    const avatarId = used.has(a.avatarId) ? avatarForArtist(a.spotifyId, genres, used) : a.avatarId;
    used.add(avatarId);
    cast.push({ avatarId, artistId: a.spotifyId, role: a.role === "main" ? "lead" : "feature", position: pos[cast.length]! });
  }

  const preferred = preferredAvatars(genres);
  const rest = avatars.map((a) => a.id);
  const seed = hash(trackKey);
  const candidates = [...preferred, ...rest.sort((x, y) => hash(x + seed) - hash(y + seed))];
  for (const id of candidates) {
    if (cast.length >= target) break;
    if (used.has(id)) continue;
    used.add(id);
    cast.push({ avatarId: id, role: "backup", position: pos[cast.length]! });
  }
  return cast;
}
