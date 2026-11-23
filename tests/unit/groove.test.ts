import { describe, expect, it } from "vitest";
import { planChoreography } from "@/lib/dance/plan";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { GROOVE_AMOUNT, grooveAt, NO_GROOVE } from "@/lib/stage/groove";

const c = planChoreography(neonlicht, 124);
const beat = c.beatMs;
const chorus = c.phrases.find((p) => p.section === "chorus")!;
const quiet = c.phrases.reduce((a, p) => (p.energy < a.energy ? p : a));
/** Zeitpunkt `after` ms nach dem n-ten Schlag ab Phrasenbeginn (Raster ab Songbeginn) */
const at = (startMs: number, n: number, after = 0) => Math.ceil(startMs / beat) * beat + n * beat + after;

describe("Groove über dem Tanz", () => {
  it("federt scharf auf dem Schlag und erholt sich bis zum nächsten; Kopf nickt zwischen den Schlägen", () => {
    const on = grooveAt(c, at(chorus.startMs, 2, 1));
    const half = grooveAt(c, at(chorus.startMs, 2, beat / 2));
    const late = grooveAt(c, at(chorus.startMs, 2, beat * 0.95));
    expect(on.squash).toBeGreaterThan(half.squash);
    expect(half.squash).toBeGreaterThan(late.squash);
    expect(on.squash).toBeLessThanOrEqual(GROOVE_AMOUNT.normal.squash);
    expect(half.nod).toBeGreaterThan(on.nod);
    expect(half.nod).toBeGreaterThan(late.nod);
  });

  it("wiegt über zwei Schläge hin und her, Nachbarn gespiegelt", () => {
    const a = grooveAt(c, at(chorus.startMs, 0, beat / 2));
    const b = grooveAt(c, at(chorus.startMs, 1, beat / 2));
    expect(Math.sign(a.sway)).toBe(-Math.sign(b.sway));
    expect(grooveAt(c, at(chorus.startMs, 0, beat / 2), { mirror: true }).sway).toBeCloseTo(-a.sway);
  });

  it("Refrain kräftiger als ruhige Teile, Chibis stärker als normale Figuren", () => {
    const loud = grooveAt(c, at(chorus.startMs, 1, beat / 2));
    const soft = grooveAt(c, at(quiet.startMs, 1, beat / 2));
    expect(quiet.energy).toBeLessThan(chorus.energy);
    expect(loud.nod).toBeGreaterThan(soft.nod);
    const chibi = grooveAt(c, at(chorus.startMs, 1, beat / 2), { chibi: true });
    expect(chibi.nod).toBeGreaterThan(loud.nod);
    expect(Math.abs(chibi.sway)).toBeGreaterThan(Math.abs(loud.sway));
    // Grenzen: auch im lautesten Moment dezent (keine Verrenkungen)
    expect(chibi.squash).toBeLessThanOrEqual(GROOVE_AMOUNT.chibi.squash);
    expect(chibi.nod).toBeLessThanOrEqual(GROOVE_AMOUNT.chibi.nod);
  });

  it("zustandslos: gleiche Songzeit, gleiche Bewegung; ohne Phrase keine", () => {
    expect(grooveAt(c, 61_234, { chibi: true })).toEqual(grooveAt(c, 61_234, { chibi: true }));
    expect(grooveAt({ ...c, phrases: [] }, 10_000)).toEqual(NO_GROOVE);
  });
});
