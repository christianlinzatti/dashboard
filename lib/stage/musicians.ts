import { phraseIndexAt } from "@/lib/dance/evaluate";
import type { Choreography, Phrase } from "@/lib/dance/plan";

/**
 * Was die Band gerade spielt – zustandslos aus Songzeit und Choreografie (gleiche Zeit → gleiches Bild):
 * Schlagzeug-Treffer (Bassdrum, Snare, Hi-Hat, Becken), Plattenteller, Akkordwechsel am Keyboard, Kopfnicken.
 * Die Werte sind Impulse 0..1, die nach dem Treffer schnell abklingen.
 */
export type DrumHits = { kick: number; snare: number; hat: number; crash: number };

/** Abklingzeit eines Treffers (ms) */
const DECAY_MS = 140;
const pulse = (sinceMs: number, decay = DECAY_MS) => (sinceMs < 0 ? 0 : Math.exp(-sinceMs / decay));

/** Schlag-Raster: Schlag im Takt (0..3), Zeit seit dem Schlag und Takt seit Phrasenbeginn */
export function grid(c: Choreography, t: number, anchorMs: number | null) {
  const base = anchorMs ?? 0;
  const beats = (t - base) / c.beatMs;
  const beat = Math.floor(beats);
  const since = (beats - beat) * c.beatMs;
  const p = c.phrases[phraseIndexAt(c, t)];
  const barInPhrase = p ? Math.floor((t - p.startMs) / c.barMs) : 0;
  return { beatInBar: ((beat % 4) + 4) % 4, since, phrase: p, barInPhrase, beats };
}

/** Gehörte Schläge (Mikrofon): Songzeit des letzten Treffers je Trommel */
export type HeardDrums = { kick: number | null; snare: number | null; hat: number | null };

/**
 * Treffer zur Songzeit t. Mit Mikrofon (`heard`) spielt das Schlagzeug, was wirklich zu hören ist; ohne nach dem
 * Raster (Bassdrum auf 1 und 3, Snare auf 2 und 4, Hi-Hat in Achteln). Becken immer nach der Songstruktur.
 */
export function drumHits(c: Choreography, t: number, anchorMs: number | null = null, heard?: HeardDrums | null): DrumHits {
  const { beatInBar, since, phrase, barInPhrase, beats } = grid(c, t, anchorMs);
  if (heard && phrase) {
    const at = (ms: number | null, decay?: number) => (ms === null ? 0 : pulse(t - ms, decay));
    const crashBar = barInPhrase === 0 || (phrase.section === "chorus" && barInPhrase % 4 === 0);
    return {
      kick: at(heard.kick),
      snare: at(heard.snare),
      hat: at(heard.hat, 60),
      crash: crashBar ? pulse(t - phrase.startMs - barInPhrase * c.barMs, 600) : 0,
    };
  }
  if (!phrase || phrase.energy <= 0) return { kick: 0, snare: 0, hat: pulse(since, 60) * 0.3, crash: 0 };
  const loud = phrase.energy >= 2;
  // Bassdrum auf 1 und 3 (laut: auf jedem Schlag), Snare auf 2 und 4, Hi-Hat in Achteln
  const kick = loud || beatInBar % 2 === 0 ? pulse(since) : 0;
  const snare = beatInBar % 2 === 1 ? pulse(since) : 0;
  const eighth = (beats * 2 - Math.floor(beats * 2)) * (c.beatMs / 2);
  const hat = pulse(eighth, 60) * (loud ? 0.8 : 0.5);
  // Becken: auf der Eins jeder Phrase, im Refrain alle vier Takte; klingt lange nach
  // (gezählt ab Phrasenbeginn – Phrasen beginnen auf ihrer eigenen Eins)
  const crashBar = barInPhrase === 0 || (phrase.section === "chorus" && barInPhrase % 4 === 0);
  const sinceBar = t - phrase.startMs - barInPhrase * c.barMs;
  const crash = crashBar ? pulse(sinceBar, 600) : 0;
  return { kick, snare, hat, crash };
}

/** Plattenteller: 33⅓ Umdrehungen pro Minute (Winkel in Rad) */
export const deckAngle = (t: number) => ((t / 1000) * (33.333 / 60) * 2 * Math.PI) % (2 * Math.PI);

/** DJ: im Refrain und bei hoher Energie wird gescratcht – Hand vor und zurück im Achteltakt (-1..1), sonst ruhig */
export function scratchAt(c: Choreography, t: number, anchorMs: number | null = null): number {
  const { phrase, beats } = grid(c, t, anchorMs);
  if (!phrase || (phrase.section !== "chorus" && phrase.energy < 3)) return 0;
  return Math.sin(beats * Math.PI * 2);
}

/** Keyboard: Akkord je Takt (welche von vier Tastengruppen gedrückt sind) und Anschlag auf jedem Schlag */
export function keysAt(c: Choreography, t: number, anchorMs: number | null = null): { zones: boolean[]; press: number } {
  const { since, phrase, beats } = grid(c, t, anchorMs);
  const bar = Math.floor(beats / 4);
  const root = ((bar % 4) + 4) % 4;
  const zones = [0, 1, 2, 3].map((z) => z === root || z === (root + 2) % 4);
  const press = phrase && phrase.energy > 0 ? pulse(since, 220) : pulse(since, 400) * 0.4;
  return { zones, press };
}

/** Kopfnicken der Musiker im Takt (Rad, nach vorn); bei Rock-Refrains Headbangen */
export function headNodAt(c: Choreography, t: number, anchorMs: number | null = null, rock = false): number {
  const { phrase, since } = grid(c, t, anchorMs);
  if (!phrase || phrase.energy <= 0) return 0;
  const hard = rock && (phrase.section === "chorus" || phrase.energy >= 3);
  const down = Math.sin(Math.PI * Math.min(since / c.beatMs, 1));
  return down * (hard ? 0.45 : 0.12);
}

/** so weit tritt der Solist auf dem Podest nach vorn (m) */
export const SOLO_STEP = 0.45;

/**
 * Band-Solo zur Zeit t: welcher Musiker und wie weit er vorgetreten ist (0..1; einen Schlag hinein, einen hinaus).
 * null außerhalb eines Solos.
 */
export function soloAt(c: Choreography, t: number): { role: NonNullable<Phrase["solo"]>; w: number } | null {
  const p = c.phrases[phraseIndexAt(c, t)];
  if (!p?.solo) return null;
  const w = Math.min(1, (t - p.startMs) / c.beatMs, (p.endMs - t) / c.beatMs);
  return { role: p.solo, w: Math.max(0, w) };
}
