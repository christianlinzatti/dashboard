import { hash } from "@/lib/avatars/casting";

/** Deterministischer Zufall (mulberry32) – gleicher Song, gleiche Choreografie. */
export function rng(seed: string | number) {
  let a = typeof seed === "number" ? seed >>> 0 : hash(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)]!;
    },
    /** gewichtete Auswahl */
    weighted<T>(items: ReadonlyArray<readonly [T, number]>): T {
      const total = items.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [item, w] of items) if ((r -= w) <= 0) return item;
      return items.at(-1)![0];
    },
  };
}
