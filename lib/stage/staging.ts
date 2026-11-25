import { easeInOut, type Vec2 } from "@/lib/dance/formations";
import type { Choreography } from "@/lib/dance/plan";
import type { EveningPhase } from "@/lib/show/evening";
import { SLOWMO_BARS } from "./climax";
import { OUTDOOR_SKIES, type DayPhase } from "./daylight";
import type { Theme, ThemeId } from "./themes";

/**
 * Bühnenbau und große Auftritte (zustandslos aus Songzeit und Plan – gleiche Songzeit, gleiches Bild):
 *
 * - Laufsteg mit B-Bühne mitten im Publikum (Club, Festival, Stadion, Lagerhalle): im letzten Refrain geht der Lead
 *   während des Kameraflugs hinaus, singt draußen mit der Menge und kehrt vor dem Refrainende zurück
 * - Hubpodest: zum ersten Song des Abends fährt der Lead aus dem Boden hoch, am Ende der Zugabe versinkt er wieder
 * - Spannungsaufbau: vier Takte vor einem großen Einsatz (Countdown) bzw. einem bekannten Drop zieht sich alles
 *   zusammen – Licht, Kamera, Publikum
 * - Drohnen-Show: auf Freiluftbühnen bei Dunkelheit im Outro (Herz, dann das Refrain-Wort)
 */

/** Maße: Laufsteg von der Bühnenkante bis zur runden B-Bühne */
export const RUNWAY_FROM_Z = 4.2;
export const B_STAGE_Z = 6.6;
export const B_STAGE_R = 0.9;
export const RUNWAY_HALF_W = 0.7;
/** Wegpunkt auf der Bühne: erst zur Mitte, dann geradeaus auf den Steg */
const RUNWAY_ENTRY: Vec2 = [0, 3.4];

/** Bühnen mit Laufsteg (große Hallen und Open Airs) */
export const RUNWAY_THEMES: readonly ThemeId[] = ["club", "festival", "stadion", "lagerhalle"];

/** so viele Takte dauert der Weg hinaus bzw. zurück */
export const RUNWAY_WALK_BARS = 2;
/** so viele Takte fährt das Hubpodest */
export const LIFT_BARS = 2;
/** so tief unter dem Boden startet bzw. endet der Lead im Hubpodest */
export const LIFT_DEPTH = 2.3;
/** so viele Takte baut sich die Spannung vor einem großen Einsatz auf */
export const BUILD_BARS = 4;

export type RunwayPlan = { outStartMs: number; outEndMs: number; backStartMs: number; backEndMs: number };
export type Lift = "hoch" | "runter";
export type BuildUp = { startMs: number; endMs: number };
export type DroneShow = { startMs: number; endMs: number };

export type Staging = {
  runway: RunwayPlan | null;
  lift: Lift | null;
  builds: BuildUp[];
  drones: DroneShow | null;
};

export const NO_STAGING: Staging = { runway: null, lift: null, builds: [], drones: null };

/** Ende des Abschnitts, der bei `atMs` beginnt (gleiche Abschnittsart) */
function sectionEnd(c: Choreography, atMs: number): number {
  const i = c.phrases.findIndex((p) => p.startMs <= atMs && atMs < p.endMs);
  if (i < 0) return atMs;
  const kind = c.phrases[i]!.section;
  let end = c.phrases[i]!.endMs;
  for (let k = i + 1; k < c.phrases.length && c.phrases[k]!.section === kind; k++) end = c.phrases[k]!.endMs;
  return end;
}

/** Abgang (Winken, Verbeugung) beginnt hier */
const exitStart = (c: Choreography) => c.durationMs - 2 * c.barMs;

/** Laufsteg: hinaus beim Einsatz des letzten Refrains (zum Kameraflug), zurück zwei Takte vor dessen Ende */
export function planRunway(c: Choreography, themeId: ThemeId): RunwayPlan | null {
  if (!RUNWAY_THEMES.includes(themeId)) return null;
  const finale = c.climaxes.find((k) => k.finale);
  if (!finale) return null;
  const walk = RUNWAY_WALK_BARS * c.barMs;
  const outStartMs = finale.atMs;
  const outEndMs = outStartMs + walk;
  const backEndMs = Math.min(sectionEnd(c, finale.atMs), exitStart(c));
  const backStartMs = backEndMs - walk;
  // draußen mindestens so lange wie der Kameraflug, sonst lohnt der Weg nicht
  if (backStartMs - outEndMs < SLOWMO_BARS * c.barMs) return null;
  return { outStartMs, outEndMs, backStartMs, backEndMs };
}

export type RunwayState = {
  /** 0 = auf der Bühne, 1 = auf der B-Bühne */
  u: number;
  phase: "hin" | "draussen" | "zurueck";
};

export function runwayAt(r: RunwayPlan | null | undefined, t: number): RunwayState | null {
  if (!r || t < r.outStartMs || t >= r.backEndMs) return null;
  if (t < r.outEndMs) return { u: easeInOut((t - r.outStartMs) / (r.outEndMs - r.outStartMs)), phase: "hin" };
  if (t < r.backStartMs) return { u: 1, phase: "draussen" };
  return { u: 1 - easeInOut((t - r.backStartMs) / (r.backEndMs - r.backStartMs)), phase: "zurueck" };
}

/** Weg vom Platz auf der Bühne über die Bühnenmitte auf die B-Bühne (u = 0..1) */
export function runwayPoint(from: Vec2, u: number): Vec2 {
  const k = 0.35; // Anteil des Wegs bis zum Steg
  if (u <= k) {
    const w = u / k;
    return [from[0] + (RUNWAY_ENTRY[0] - from[0]) * w, from[1] + (RUNWAY_ENTRY[1] - from[1]) * w];
  }
  const w = (u - k) / (1 - k);
  return [RUNWAY_ENTRY[0], RUNWAY_ENTRY[1] + (B_STAGE_Z - RUNWAY_ENTRY[1]) * w];
}

/** Hubpodest: erster Song des Abends hoch, Zugabe am Ende hinab */
export function liftFor(phase: EveningPhase | null | undefined): Lift | null {
  return phase === "auftakt" ? "hoch" : phase === "zugabe" ? "runter" : null;
}

/** Höhe des Leads über dem Bühnenboden (negativ = noch bzw. wieder im Podest) */
export function liftHeightAt(c: Choreography, lift: Lift | null | undefined, t: number): number {
  if (lift === "hoch") {
    const u = t / (LIFT_BARS * c.barMs);
    return u >= 1 ? 0 : -LIFT_DEPTH * (1 - easeOutCubic(Math.max(u, 0)));
  }
  if (lift === "runter") {
    // in der Verbeugung (letzter Takt) langsam hinab
    const start = c.durationMs - c.barMs;
    if (t < start) return 0;
    const u = Math.min((t - start) / c.barMs, 1);
    return -LIFT_DEPTH * u * u;
  }
  return 0;
}

const easeOutCubic = (u: number) => 1 - Math.pow(1 - Math.min(u, 1), 3);

/** Vier Takte Aufbau vor jedem großen Einsatz mit Countdown (endet mit dem Blackout) und vor bekannten Drops */
export function planBuilds(c: Choreography): BuildUp[] {
  const len = BUILD_BARS * c.barMs;
  const ends = [
    ...c.climaxes.filter((k) => k.countdown).map((k) => k.atMs - c.barMs),
    ...(c.knownDrops ?? []).map((ms) => ms),
  ].sort((a, b) => a - b);
  const out: BuildUp[] = [];
  for (const endMs of ends) {
    const startMs = endMs - len;
    if (startMs < 2 * c.barMs) continue;
    // nicht zweimal denselben Einsatz und nicht über den vorigen Einsatz hinweg
    const prev = out.at(-1);
    if (prev && startMs < prev.endMs + 2 * c.barMs) continue;
    out.push({ startMs, endMs });
  }
  return out;
}

/** Fortschritt des Aufbaus 0..1 (0 = kein Aufbau) */
export function buildAt(c: Pick<Choreography, "staging">, t: number): number {
  for (const b of c.staging?.builds ?? []) if (t >= b.startMs && t < b.endMs) return (t - b.startMs) / (b.endMs - b.startMs);
  return 0;
}

/** Drohnen nur draußen und bei Dunkelheit (gestalteter Abendhimmel zählt dazu) */
export function dronesFit(theme: Pick<Theme, "sky">, daylight: DayPhase | undefined): boolean {
  return (OUTDOOR_SKIES as readonly string[]).includes(theme.sky) && daylight !== "tag";
}

/** so lange dauert die Drohnen-Show höchstens */
export const DRONE_BARS = 16;

/** Drohnen-Show: ab dem Outro (sonst die letzten acht Takte vor dem Abgang), höchstens 16 Takte, mindestens vier */
export function planDrones(c: Choreography): DroneShow | null {
  const exit = exitStart(c);
  const outro = c.phrases.find((p, i) => p.section === "outro" && c.phrases.slice(i).every((q) => q.section === "outro"));
  const finale = c.climaxes.find((k) => k.finale);
  const startMs = outro ? outro.startMs : Math.max(exit - 8 * c.barMs, finale ? finale.atMs + 4 * c.barMs : 0);
  const endMs = Math.min(exit, startMs + DRONE_BARS * c.barMs);
  return endMs - startMs >= 4 * c.barMs ? { startMs, endMs } : null;
}

/** Kamera in den Himmel: während Schwarm und Herz, kurz zurück auf die Bühne, dann zum Wort wieder hoch */
export function droneShotAt(d: DroneShow | null | undefined, t: number): boolean {
  if (!d || t < d.startMs || t >= d.endMs) return false;
  const u = (t - d.startMs) / (d.endMs - d.startMs);
  return u < 0.42 || (u >= 0.56 && u < 0.95);
}

export type DroneFormation = "schwarm" | "herz" | "wort" | "aus";

/** Was die Drohnen gerade zeigen und wie weit der Übergang dorthin ist (0..1) */
export function dronesAt(d: DroneShow | null | undefined, t: number): { formation: DroneFormation; w: number; level: number } {
  if (!d || t < d.startMs) return { formation: "aus", w: 0, level: 0 };
  const u = (t - d.startMs) / (d.endMs - d.startMs);
  // nach dem Ende verblassen sie über zwei Sekunden
  const level = u < 0.08 ? u / 0.08 : u <= 1 ? 1 : Math.max(0, 1 - (t - d.endMs) / 2000);
  if (u < 0.2) return { formation: "schwarm", w: u / 0.2, level };
  if (u < 0.55) return { formation: "herz", w: Math.min((u - 0.2) / 0.1, 1), level };
  return { formation: "wort", w: Math.min((u - 0.55) / 0.1, 1), level };
}

/** Herzkurve (Einheitsgröße, Mitte bei 0): Punkt i von n auf dem Umriss */
export function heartPoint(i: number, n: number): Vec2 {
  const a = (i / n) * Math.PI * 2;
  const x = 16 * Math.pow(Math.sin(a), 3);
  const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
  return [x / 17, y / 17];
}

/** Alles zusammen für einen Song auf einer Bühne */
export function planStaging(
  c: Choreography,
  theme: Pick<Theme, "id" | "sky">,
  phase: EveningPhase | null | undefined,
  daylight: DayPhase | undefined,
): Staging {
  return {
    runway: planRunway(c, theme.id),
    lift: liftFor(phase),
    builds: planBuilds(c),
    drones: dronesFit(theme, daylight) ? planDrones(c) : null,
  };
}

/** Mitte und Größe des Drohnen-Bilds am Himmel (hinter und hoch über der Bühne, über Dach und Traverse) */
export const DRONE_CENTER: [number, number, number] = [0, 22, -20];
export const DRONE_SIZE = 5;

/** Lichtsäule des Hubpodests 0..1: während der Fahrt voll, danach über einen Takt aus */
export function liftGlowAt(c: Choreography, lift: Lift | null | undefined, t: number): number {
  if (lift === "hoch") {
    const end = LIFT_BARS * c.barMs;
    return t < 0 ? 0 : t < end ? 1 : Math.max(0, 1 - (t - end) / c.barMs);
  }
  if (lift === "runter") {
    const start = c.durationMs - c.barMs;
    return t < start ? 0 : Math.min(1, (t - start) / (c.barMs / 4));
  }
  return 0;
}
