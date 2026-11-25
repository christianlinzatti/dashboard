import type { Choreography } from "@/lib/dance/plan";
import { crowdProfile } from "./crowd";
import type { LightScene } from "./lights";

/**
 * Bühnennebel – zustandslos aus Songzeit und Plan:
 *
 * - Bodennebel (Trockeneis): liegt dicht im Intro, in der Bridge, im Outro, bei Balladen und im Spannungsaufbau;
 *   im Refrain und Drop wird er dünn (die Tänzer wirbeln ihn auf)
 * - Nebelmaschinen links und rechts hinten auf der Bühne blasen bei jedem Abschnittswechsel Schwaden über die Bühne,
 *   bei ruhigen Abschnitten länger und dichter
 *
 * Gerendert als wenige große, weiche Partikel in einem Zeichenaufruf (components/stage/effects/Smoke.tsx).
 */

/** Dichte des Bodennebels je Lichtszene (0..1) */
export const GROUND_FOG: Record<LightScene, number> = {
  intro: 0.95,
  outro: 0.9,
  bridge: 0.8,
  strophe: 0.45,
  refrain: 0.25,
  instrumental: 0.35,
  drop: 0.15,
  applaus: 0.5,
  aufbau: 0.85,
};

/** Balladen und ruhige Songs: der Nebel bleibt auch in Strophe und Refrain dichter */
export function groundFogLevel(scene: LightScene, ballad: boolean): number {
  const base = GROUND_FOG[scene];
  return ballad ? Math.max(base, 0.6) : base;
}

/** Nebelmaschinen: Position (Bühnenrand hinten) und Richtung, in die sie blasen */
export const SMOKE_MACHINES: Array<{ pos: [number, number, number]; dir: [number, number, number] }> = [
  { pos: [-4.4, 0.25, -1.4], dir: [0.85, 0.08, 0.5] },
  { pos: [4.4, 0.25, -1.4], dir: [-0.85, 0.08, 0.5] },
];

/** so lange bläst eine Maschine; so lange schweben ihre Schwaden danach */
export const BURST_MS = 2200;
export const PUFF_LIFE_MS = 9000;

export type SmokeBurst = { atMs: number; strength: number };

/** Stöße bei jedem Abschnittswechsel (und zum Songstart); ruhige Abschnitte dichter */
export function planSmoke(c: Pick<Choreography, "phrases" | "crowdStyle">): SmokeBurst[] {
  const out: SmokeBurst[] = [];
  c.phrases.forEach((p, i) => {
    if (i > 0 && c.phrases[i - 1]!.section === p.section) return;
    const calm = p.energy <= 1 || crowdProfile(p, c.crowdStyle).phones > 0.5;
    out.push({ atMs: p.startMs, strength: calm ? 1 : 0.65 });
  });
  return out;
}

/**
 * Die beiden jüngsten Stöße, deren Schwaden noch schweben (Alter in ms, Stärke) – mehr zeichnet der Shader nicht.
 * Ältere zuerst, damit die Partikel-Gruppen beim Weiterschalten nicht springen.
 */
export function activeBursts(bursts: readonly SmokeBurst[], t: number): Array<{ ageMs: number; strength: number }> {
  const live = bursts.filter((b) => t >= b.atMs && t < b.atMs + BURST_MS + PUFF_LIFE_MS);
  return live.slice(-2).map((b) => ({ ageMs: t - b.atMs, strength: b.strength }));
}

/** Teilchen je Qualitätsstufe: Boden und Stöße (der Pi 5 auf „mittel“ kommt mit wenigen großen gut aus) */
export const SMOKE_COUNTS = {
  niedrig: { ground: 0, burst: 0 },
  mittel: { ground: 22, burst: 14 },
  hoch: { ground: 36, burst: 24 },
} as const;
