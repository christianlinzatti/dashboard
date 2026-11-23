import { hash } from "./casting";
import { hats, type Hat, type LookOverride } from "./look-override";

export { hats, type Hat };

/**
 * Looks: Zubehör und Statur für die Avatare – aus 11 Grundmodellen werden viele verschiedene Figuren. Künstler tragen
 * immer denselben Look (stabil über den Künstler), die Crew wechselt von Song zu Song. Rein und deterministisch;
 * die Formen baut der Avatar (components/stage/Accessories.ts).
 */

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
  "dino-rex",
  "einhorn",
  "fuchs-fritzi",
  "hai-kostuem",
  "zauberer-zarko",
  "pirat-paula",
  "ninja-nori",
  // Chibis mit Ohren, Kapuze, Mütze, Zöpfen oder Haarknoten
  "chibi-mika",
  "chibi-fuchsi",
  "chibi-hana",
  "chibi-momo",
  "chibi-rin",
  "chibi-sora",
  "chibi-tora",
  "chibi-pixel",
]);

export function lookForAvatar(avatarId: string, seed: string): Look {
  const look = lookFor(seed);
  // Chibis: keine Sonnenbrille über den großen Augen
  const own = avatarId.startsWith("chibi-") ? { ...look, glasses: false } : look;
  return OWN_HEADWEAR.has(avatarId) ? { ...own, hat: undefined, headphones: false } : own;
}

/**
 * Wünsche aus dem Avatar-Baukasten über den gewürfelten Look legen – der ausdrückliche Wunsch gewinnt, auch bei
 * Figuren mit eigener Kopfbedeckung. Breitkrempige Hüte und Kopfhörer schließen sich weiter aus.
 */
export function applyLookOverride(look: Look, o: LookOverride | undefined): Look {
  if (!o) return look;
  const hat = o.hat === "keiner" ? undefined : (o.hat ?? look.hat);
  const wide = hat === "cowboyhut" || hat === "zylinder";
  return {
    ...look,
    hat,
    headphones: wide ? false : (o.headphones ?? look.headphones),
    glasses: o.glasses ?? look.glasses,
    height: o.height ?? look.height,
  };
}

/** Schlüssel des Looks: Künstler stabil, Crew je Song anders, Band je Musiker */
export function lookSeed(member: { avatarId: string; artistId?: string }, trackKey: string, band = false): string {
  if (band) return `band:${member.avatarId}`;
  return member.artistId ? `kuenstler:${member.artistId}` : `crew:${member.avatarId}:${trackKey}`;
}
