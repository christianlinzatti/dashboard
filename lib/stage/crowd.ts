import { phraseIndexAt } from "@/lib/dance/evaluate";
import type { Choreography, CrowdStyle, Phrase } from "@/lib/dance/plan";
import { singAlongAt } from "@/lib/show/singalong";

/**
 * Publikums-Regie: was die Menge vor der Bühne gerade tut – zustandslos aus Songzeit und Choreografie.
 *
 * - ruhige Teile (Intro, Bridge, Outro, Balladen): Handylichter-Meer, alle wiegen sich
 * - Strophen: einzelne Hände, LED-Armbänder funkeln; mit mehr Energie klatschen viele über dem Kopf im Takt
 * - Refrain / hohe Energie: Hände oben, Springen im Takt, Armbänder pulsieren gemeinsam
 * - Instrumentalteile mit Energie: La-Ola-Welle läuft im Takt von links nach rechts durch die Menge
 * - Drop: alles auf Anschlag
 */
export type CrowdFrame = {
  /** Anteil der Leute mit erhobenen Händen 0..1 */
  hands: number;
  /** Springen im Takt 0..1 */
  jump: number;
  /** Anteil mit leuchtendem Handy 0..1 */
  phones: number;
  /** Helligkeit der LED-Armbänder 0..1 */
  bands: number;
  /** Armband-Muster: 0 Funkeln, 1 gemeinsamer Puls, 2 Welle durch die Menge */
  bandMode: 0 | 1 | 2;
  /** Wiegen 0..1 */
  sway: number;
  /** Moshpit vor der Bühnenmitte: schubsen und springen 0..1 (Rock) */
  mosh: number;
  /** Feuerzeuge statt Handys: warmes, flackerndes Licht 0..1 (Balladen) */
  lighter: number;
  /** Anteil der Leute, die über dem Kopf im Takt klatschen 0..1 */
  clap: number;
  /** La-Ola-Welle 0..1: wer gerade an der Reihe ist, springt mit gestreckten Armen auf */
  wave: number;
};

export type CrowdInput = { dropMs?: number | null };

const QUIET: CrowdFrame = {
  hands: 0.05,
  jump: 0,
  phones: 0.8,
  bands: 0.15,
  bandMode: 0,
  sway: 1,
  mosh: 0,
  lighter: 0,
  clap: 0,
  wave: 0,
};

const DIRECTED: Record<NonNullable<Phrase["crowd"]>, CrowdFrame> = {
  handys: { ...QUIET, phones: 0.9 },
  wiegen: { hands: 0.1, jump: 0, phones: 0.15, bands: 0.45, bandMode: 0, sway: 1, mosh: 0, lighter: 0, clap: 0, wave: 0 },
  haende: { hands: 0.85, jump: 0.2, phones: 0, bands: 0.9, bandMode: 2, sway: 0.4, mosh: 0, lighter: 0, clap: 0, wave: 0 },
  springen: { hands: 0.85, jump: 1, phones: 0, bands: 1, bandMode: 1, sway: 0.2, mosh: 0, lighter: 0, clap: 0, wave: 0 },
  moshpit: { hands: 0.6, jump: 1, phones: 0, bands: 0.8, bandMode: 1, sway: 0, mosh: 1, lighter: 0, clap: 0, wave: 0 },
  feuerzeuge: { ...QUIET, phones: 0.85, lighter: 1 },
  klatschen: { hands: 0.1, jump: 0, phones: 0, bands: 0.7, bandMode: 1, sway: 0.3, mosh: 0, lighter: 0, clap: 0.75, wave: 0 },
  welle: { hands: 0.1, jump: 0, phones: 0, bands: 0.8, bandMode: 2, sway: 0.2, mosh: 0, lighter: 0, clap: 0, wave: 1 },
};

/** Stil des Songs (Rock → Moshpit im Refrain, Ballade → Feuerzeuge statt Handys) */
function styled(f: CrowdFrame, p: Pick<Phrase, "section" | "energy">, style: CrowdStyle | undefined): CrowdFrame {
  if (style === "rock" && (p.section === "chorus" || p.energy >= 3)) return { ...f, mosh: 1, jump: Math.max(f.jump, 0.9) };
  if (style === "ballade" && f.phones > 0.5) return { ...f, lighter: 1, clap: 0, wave: 0 };
  return f;
}

/** Zielzustand für eine Phrase – eine Regieanweisung (KI) geht vor */
export function crowdProfile(p: Pick<Phrase, "section" | "energy" | "crowd">, style?: CrowdStyle): CrowdFrame {
  if (p.crowd) return DIRECTED[p.crowd];
  return styled(baseProfile(p), p, style);
}

function baseProfile(p: Pick<Phrase, "section" | "energy">): CrowdFrame {
  if (p.section === "bridge" && p.energy <= 2) return { ...QUIET, phones: 0.9 };
  // Instrumentalteil mit Schwung (Solo, Zwischenspiel): La-Ola statt Springen
  if (p.section === "instrumental" && p.energy >= 2) return DIRECTED.welle;
  if (p.energy <= 0) return QUIET;
  if (p.section === "chorus" || p.energy >= 3)
    return {
      hands: 0.85,
      jump: p.energy >= 3 ? 1 : 0.6,
      phones: 0,
      bands: 1,
      bandMode: 1,
      sway: 0.2,
      mosh: 0,
      lighter: 0,
      clap: 0,
      wave: 0,
    };
  if (p.energy === 2)
    return { hands: 0.25, jump: 0.3, phones: 0.05, bands: 0.7, bandMode: 2, sway: 0.5, mosh: 0, lighter: 0, clap: 0.5, wave: 0 };
  return { hands: 0.12, jump: 0, phones: 0.2, bands: 0.4, bandMode: 0, sway: 0.7, mosh: 0, lighter: 0, clap: 0, wave: 0 };
}

/** Mitsing-Moment: alle Hände hoch, die ganze Menge schwenkt gemeinsam die Arme, Armbänder als Welle */
const SINGALONG: CrowdFrame = {
  hands: 0.95,
  jump: 0,
  phones: 0.25,
  bands: 1,
  bandMode: 2,
  sway: 1,
  mosh: 0,
  lighter: 0,
  clap: 0,
  wave: 0,
};

const DROP: CrowdFrame = { hands: 1, jump: 1, phones: 0, bands: 1, bandMode: 1, sway: 0, mosh: 0, lighter: 0, clap: 0, wave: 0 };

const mix = (a: CrowdFrame, b: CrowdFrame, w: number): CrowdFrame => ({
  hands: a.hands + (b.hands - a.hands) * w,
  jump: a.jump + (b.jump - a.jump) * w,
  phones: a.phones + (b.phones - a.phones) * w,
  bands: a.bands + (b.bands - a.bands) * w,
  bandMode: w < 0.5 ? a.bandMode : b.bandMode,
  sway: a.sway + (b.sway - a.sway) * w,
  mosh: a.mosh + (b.mosh - a.mosh) * w,
  lighter: a.lighter + (b.lighter - a.lighter) * w,
  clap: a.clap + (b.clap - a.clap) * w,
  wave: a.wave + (b.wave - a.wave) * w,
});

/** Publikum zur Songzeit t: weicher Übergang über zwei Takte, Drops (Mikrofon) überlagern für zwei Takte. */
export function crowdAt(c: Choreography, t: number, input: CrowdInput = {}): CrowdFrame {
  const i = phraseIndexAt(c, t);
  const p = c.phrases[i];
  if (!p) return QUIET;
  const prev = c.phrases[i - 1];
  const w = Math.min(Math.max((t - p.startMs) / (2 * c.barMs), 0), 1);
  const style = c.crowdStyle;
  let frame = prev ? mix(crowdProfile(prev, style), crowdProfile(p, style), w) : crowdProfile(p, style);
  const sing = singAlongAt(c.singAlong, t, c.beatMs);
  if (sing > 0) frame = mix(frame, SINGALONG, sing);
  const drop = input.dropMs;
  if (drop != null && t >= drop && t < drop + 2 * c.barMs) {
    const out = Math.min((drop + 2 * c.barMs - t) / c.beatMs, 1);
    frame = mix(frame, DROP, Math.min((t - drop) / (c.beatMs / 2), 1) * out);
  }
  return frame;
}

/** Feste Plätze der Menge: Ringsegment vor der Bühne (x, z, Größe, vier Zufallswerte). Reihenfolge zufällig → jeder Anfangsteil ist gleichmäßig verteilt. */
export function crowdSpots(count: number, next: () => number): Float32Array {
  const out = new Float32Array(count * 7);
  const [r1, r2] = [4.9, 13];
  for (let i = 0; i < count; i++) {
    // dicht gedrängt an der Bühnenkante und vor der Mitte, nach hinten und zu den Seiten lockerer
    const r = r1 + (r2 - r1) * Math.pow(next(), 1.6);
    const v = next() * 2 - 1;
    const a = Math.sign(v) * Math.pow(Math.abs(v), 1.25) * ((115 * Math.PI) / 180); // Winkel um die Blickrichtung zur Bühne (+z)
    out.set([Math.sin(a) * r, Math.cos(a) * r, 0.9 + next() * 0.18, next(), next(), next(), next()], i * 7);
  }
  return out;
}
