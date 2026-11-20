import { hash } from "./casting";

/**
 * Looks: Zubehör und Statur für die Avatare – aus 11 Grundmodellen werden viele verschiedene Figuren. Künstler tragen
 * immer denselben Look (stabil über den Künstler), die Crew wechselt von Song zu Song. Rein und deterministisch;
 * die Formen baut der Avatar (components/stage/Accessories.ts).
 */
export const hats = ["basecap", "muetze", "cowboyhut", "zylinder", "fischerhut"] as const;
export type Hat = (typeof hats)[number];

export type Look = {
  hat?: Hat;
  /** Kopfhörer um den Kopf (nicht mit breitkrempigen Hüten) */
  headphones: boolean;
  /** Sonnenbrille (nur Comic-Gesichter – Visier und LED-Gesicht haben keine Augen) */
  glasses: boolean;
  /** Statur: Größe relativ zur Normalgröße */
  height: number;
  /** Farbe von Hut/Kopfhörer: 0..1 → Index in die Farben des Auftritts */
  tint: number;
};

/** Gleichverteilter Wert 0..1 aus einem Schlüssel (mehrere unabhängige Würfe je Schlüssel) */
function roll(seed: string, what: string) {
  return (hash(`${seed}:${what}`) % 10_000) / 10_000;
}

export function lookFor(seed: string): Look {
  const h = roll(seed, "hut");
  // knapp die Hälfte trägt etwas auf dem Kopf
  const hat: Hat | undefined =
    h < 0.15 ? "basecap" : h < 0.25 ? "muetze" : h < 0.32 ? "cowboyhut" : h < 0.38 ? "zylinder" : h < 0.45 ? "fischerhut" : undefined;
  const wide = hat === "cowboyhut" || hat === "zylinder";
  return {
    hat,
    headphones: !wide && roll(seed, "kopfhoerer") < 0.16,
    glasses: roll(seed, "brille") < 0.3,
    height: 0.94 + roll(seed, "groesse") * 0.12,
    tint: roll(seed, "farbe"),
  };
}

/**
 * Figuren mit eigener Kopfbedeckung oder auffälligem Kopf (Helm, Cowboyhut, Ohren, Fühler, Haar-Puffs) bekommen
 * keinen zusätzlichen Hut und keine Kopfhörer – Brille und Statur bleiben.
 */
export const OWN_HEADWEAR: ReadonlySet<string> = new Set([
  "astro-nova",
  "cowboy-joe",
  "eisen-ritter",
  "mietz-katze",
  "disco-baer",
  "kosmo-alien",
  "mc-flow",
  "dirndl-vroni",
  "lederhosn-sepp",
  "tolle-teddy",
  "disco-king",
  "mariachi-miguel",
  "weihnachtsmann",
  "rentier",
  "schneemann",
  "kuerbis-kopf",
  "vampir-vlad",
]);

export function lookForAvatar(avatarId: string, seed: string): Look {
  const look = lookFor(seed);
  return OWN_HEADWEAR.has(avatarId) ? { ...look, hat: undefined, headphones: false } : look;
}

/** Schlüssel des Looks: Künstler stabil, Crew je Song anders, Band je Musiker */
export function lookSeed(member: { avatarId: string; artistId?: string }, trackKey: string, band = false): string {
  if (band) return `band:${member.avatarId}`;
  return member.artistId ? `kuenstler:${member.artistId}` : `crew:${member.avatarId}:${trackKey}`;
}
