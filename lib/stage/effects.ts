import type { Choreography } from "@/lib/dance/plan";
import { rng } from "@/lib/dance/rng";
import type { EffectKind, Theme } from "./themes";

/** Ein Spezialeffekt-Einsatz: Art, Start, Dauer der Auslösung, Stärke 0..1, Zufallssaat für die Partikel. */
export type Cue = { kind: EffectKind; startMs: number; durationMs: number; intensity: number; seed: number };

/** Wie lange Partikel nach dem Ende der Auslösung noch sichtbar sind (Flugzeit). */
export const LINGER_MS: Record<EffectKind, number> = {
  pyro: 1600,
  funken: 1300,
  flammen: 500,
  co2: 1800,
  // Konfetti wird in einer halben Sekunde verschossen, schwebt herab und bleibt liegen (CONFETTI_LIFE in Effects3D)
  konfetti: 16000,
  // Schaumflocken leben 9 s: sinken und liegen als Teppich (FOAM_LIFE in Effects3D)
  schaum: 9000,
  feuerwerk: 2600,
  ringe: 1200,
  sternschnuppen: 1500,
  glitzer: 0,
};

/**
 * Effekt-Regie: plant die Spezialeffekte eines Songs aus der Choreografie –
 * deterministisch (gleicher Song, gleiche Effekte; gleiche Songzeit, gleiches Bild).
 *
 * - Refrain-Beginn: Pyro-Fontänen / CO₂-Jets / Funkenregen (je nach Bühne)
 * - erster großer Einsatz (nach dem Countdown): kurzer Konfetti-Schuss
 * - vorletzter Refrain: Schaumkanonen über dem Publikum (Schaumparty), wenn die Bühne sie hat
 * - letzter Refrain: Konfetti-Kanonen und Feuerwerk
 * - Abschnitte mit hoher Energie: Beat-Ringe auf dem Boden, Funken auf jedem zweiten Takt
 * - ruhige Abschnitte: Sternschnuppen bzw. Spiegelkugel-Glitzer
 */
export function planEffects(c: Choreography, theme: Theme, opts: { bigNight?: boolean } = {}): Cue[] {
  const allowed = new Set(theme.effects);
  const r = rng(`${c.trackKey}:fx:${theme.id}`);
  const out: Cue[] = [];
  const add = (kind: EffectKind, startMs: number, durationMs: number, intensity: number) => {
    if (allowed.has(kind)) out.push({ kind, startMs, durationMs, intensity, seed: Math.floor(r.next() * 1e6) });
  };
  const sectionStarts = c.phrases.filter((p, i) => i === 0 || c.phrases[i - 1]!.section !== p.section);
  // Finale: letzter Refrain – ohne Refrain (z. B. Instrumental) der letzte energiereiche Abschnitt
  const lastChorus =
    sectionStarts.filter((p) => p.section === "chorus").at(-1) ??
    sectionStarts.filter((p) => p.section === "instrumental" && p.energy >= 2).at(-1);
  // Schaumparty im vorletzten Refrain – so bleiben Schaum und Konfetti-Finale getrennte Höhepunkte
  const foam = sectionStarts.filter((p) => p.section === "chorus").at(-2);

  c.phrases.forEach((p, i) => {
    const first = i === 0 || c.phrases[i - 1]!.section !== p.section;
    const len = p.endMs - p.startMs;

    // Regieanweisung (KI): leere Liste = ausdrücklich nichts für diesen Abschnitt
    const quiet = p.effects !== undefined && p.effects.length === 0;
    const hits = theme.effects.filter((k) => k === "pyro" || k === "co2" || k === "funken");
    const wanted = hits.filter((k) => p.effects?.includes(k));

    if (first && !quiet && (p.section === "chorus" || (p.section === "instrumental" && p.energy >= 2) || wanted.length)) {
      // Knall zum Einsatz: eine Hauptattraktion (Wunsch der Regie zuerst), dazu evtl. Funken
      const main = wanted.length ? r.pick(wanted) : hits.length ? r.pick(hits) : undefined;
      if (main) add(main, p.startMs, main === "co2" ? 1000 : 2 * c.barMs, 1);
      if (main !== "funken" && r.next() < 0.6) add("funken", p.startMs + 4 * c.barMs, c.barMs, 0.8);
    }
    if (first && !quiet && p !== lastChorus && p.effects?.includes("konfetti")) add("konfetti", p.startMs, 6000, 0.7);
    if (first && !quiet && (p === foam || p.effects?.includes("schaum"))) add("schaum", p.startMs, Math.min(len, 4 * c.barMs), 1);
    if (p === lastChorus) {
      add("konfetti", p.startMs, 8000, 1);
      add("feuerwerk", p.startMs + c.barMs, Math.min(len, 16 * c.barMs), 1);
    }
    if (p.energy >= 2) add("ringe", p.startMs, len, p.energy >= 3 ? 1 : 0.6);
    // Flammen auf jeden Taktanfang, solange die Energie am Anschlag ist
    if (p.energy >= 3 && !quiet)
      for (let b = 0; b * c.barMs < len - c.beatMs; b++) add("flammen", p.startMs + b * c.barMs, 320, 1);
    if (p.energy >= 3) for (let b = 2; b * c.barMs < len - c.barMs; b += 4) add("funken", p.startMs + b * c.barMs, c.barMs, 0.6);
    if (p.section === "intro" || p.section === "bridge" || p.section === "outro" || p.energy <= 0)
      add("sternschnuppen", p.startMs, len, 0.7);
    add("glitzer", p.startMs, len, p.energy >= 2 ? 1 : 0.5);
  });
  // Großer Einsatz nach dem Countdown: alles, was die Bühne hergibt, gleichzeitig
  for (const k of c.climaxes ?? [])
    if (k.countdown) {
      out.push(...dropCues(k.atMs, c, theme));
      // erster großer Einsatz: kurzer Konfetti-Schuss (nicht zugleich mit Schaum; das Finale hat sein eigenes)
      if (!k.finale && !out.some((q) => q.kind === "schaum" && q.startMs === k.atMs))
        add("konfetti", k.atMs, 1000, opts.bigNight ? 1 : 0.7);
      // Höhepunkt des Abends / Zugabe: Feuerwerk schon beim ersten großen Einsatz
      if (!k.finale && opts.bigNight) add("feuerwerk", k.atMs + c.barMs, 8 * c.barMs, 1);
    }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** Bei einem (per Mikrofon erkannten) Drop: alles, was die Bühne hergibt. */
export function dropCues(dropMs: number, c: Choreography, theme: Theme): Cue[] {
  const kinds: EffectKind[] = ["co2", "pyro", "funken", "flammen"];
  return kinds
    .filter((k) => theme.effects.includes(k))
    .map((kind) => ({
      kind,
      startMs: dropMs,
      durationMs: kind === "co2" ? 1200 : c.barMs,
      intensity: 1,
      seed: Math.round(dropMs),
    }));
}

export type ActiveCue = Cue & { ageMs: number };

/** Aktive Effekte zur Songzeit t (inkl. nachfliegender Partikel). Spätere Einsätze zuerst. */
export function effectsAt(cues: readonly Cue[], t: number, extra: readonly Cue[] = []): ActiveCue[] {
  const out: ActiveCue[] = [];
  for (const list of [extra, cues])
    for (const q of list) {
      if (q.startMs > t) continue;
      if (t < q.startMs + q.durationMs + LINGER_MS[q.kind]) out.push({ ...q, ageMs: t - q.startMs });
    }
  return out.sort((a, b) => b.startMs - a.startMs);
}
