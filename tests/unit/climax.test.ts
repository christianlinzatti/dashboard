import { describe, expect, it } from "vitest";
import { planChoreography } from "@/lib/dance/plan";
import { cameraAt, type Cam } from "@/lib/dance/evaluate";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";
import { climaxAt, danceTime, planClimaxes, SLOWMO_BARS } from "@/lib/stage/climax";
import { lightsAt } from "@/lib/stage/lights";
import { planEffects } from "@/lib/stage/effects";
import { THEMES } from "@/lib/stage/themes";
import { lightMessage } from "@/lib/bridge/client";
import { deviceStateFor } from "../../bridge/mapping.ts";

const c = planChoreography(neonlicht, 124);
const first = c.climaxes[0]!;
const finale = c.climaxes.find((k) => k.finale)!;
const input = { anchorMs: null, dropMs: null, energy: 0.5, micActive: false, strobeAllowed: true };
const light = (t: number) => lightsAt(neonlicht, c, 8, { ...input, t });

describe("Höhepunkte", () => {
  it("Refrain-Einsätze; der erste und das Finale (letzter Refrain) mit Countdown", () => {
    const chorusStarts = c.phrases.filter((p, i) => p.section === "chorus" && c.phrases[i - 1]?.section !== "chorus");
    expect(c.climaxes.map((k) => k.atMs)).toEqual(chorusStarts.map((p) => p.startMs));
    expect(first.countdown).toBe(true);
    expect(finale.atMs).toBe(chorusStarts.at(-1)!.startMs);
    expect(c.climaxes.filter((k) => k.countdown)).toHaveLength(2);
    expect(c.climaxes.filter((k) => k.finale)).toHaveLength(1);
    expect(planClimaxes([], c.barMs)).toEqual([]);
  });

  it("Countdown 4-3-2-1 im Takt vor dem Einsatz, dann ein Takt Einschlag", () => {
    const at = (beatsBefore: number) => climaxAt(c.climaxes, first.atMs - beatsBefore * c.beatMs + 1, c.barMs);
    expect([4, 3, 2, 1].map((b) => at(b)?.countdown)).toEqual([4, 3, 2, 1]);
    expect(at(4)?.phase).toBe("blackout");
    expect(climaxAt(c.climaxes, first.atMs + 10, c.barMs)).toMatchObject({ phase: "hit", big: true });
    expect(climaxAt(c.climaxes, first.atMs - c.barMs - 10, c.barMs)).toBeNull();
    expect(climaxAt(c.climaxes, first.atMs + c.barMs + 10, c.barMs)).toBeNull();
  });

  it("Licht: Blackout dunkelt Köpfe, Laser, Wand und Lampen ab – beim Einsatz Blitz und Lauflicht", () => {
    const dark = light(first.atMs - c.beatMs);
    expect(dark.blackout).toBe(1);
    expect(dark.countdown).toBe(1);
    expect(Math.max(...dark.heads.map((h) => h.intensity))).toBe(0);
    expect(dark.lasers.on).toBe(false);
    expect(dark.signal.brightness).toBeLessThan(0.05);
    expect(dark.signal.chase).toBe(-1);
    const hit = light(first.atMs + 5);
    expect(hit.scene).toBe("drop");
    expect(hit.strobe).toBeGreaterThan(0);
    expect(hit.signal.brightness).toBe(1);
    expect(hit.signal.chase).toBeGreaterThanOrEqual(0);
    expect(light(first.atMs + 5).countdown).toBeNull();
    // ohne Strobe-Erlaubnis kein Blitz (Fotosensitivität)
    expect(lightsAt(neonlicht, c, 8, { ...input, strobeAllowed: false, t: first.atMs + 5 }).strobe).toBe(0);
  });

  it("Effekte: beim großen Einsatz zündet alles, was die Bühne hat", () => {
    const cues = planEffects(c, THEMES.festival)
      .filter((q) => q.startMs === first.atMs)
      .map((q) => q.kind);
    expect(cues).toEqual(expect.arrayContaining(["pyro", "co2", "funken", "flammen"]));
  });

  it("Zeitlupe im Finale: erst langsamer, dann aufholen – danach wieder genau im Takt", () => {
    const d = SLOWMO_BARS * c.barMs;
    expect(danceTime(c.climaxes, finale.atMs - 100, c.barMs)).toBe(finale.atMs - 100);
    expect(danceTime(c.climaxes, finale.atMs + d, c.barMs)).toBe(finale.atMs + d);
    const speed = (u: number) =>
      (danceTime(c.climaxes, finale.atMs + u * d + 10, c.barMs) - danceTime(c.climaxes, finale.atMs + u * d, c.barMs)) / 10;
    expect(speed(0.02)).toBeLessThan(0.5);
    expect(speed(0.5)).toBeGreaterThan(1.4);
    expect(speed(0.98)).toBeLessThan(0.5);
    // stetig (kein Sprung) an beiden Rändern
    expect(Math.abs(danceTime(c.climaxes, finale.atMs + 1, c.barMs) - finale.atMs)).toBeLessThan(2);
  });

  it("Finale: Kamera fliegt von hinter dem Publikum auf die Bühne zu", () => {
    const start = cameraAt(c, finale.atMs + 1);
    expect(start.pos[2]).toBeGreaterThan(14);
    expect(start.pos[1]).toBeGreaterThan(4);
    const after = cameraAt(c, finale.atMs + SLOWMO_BARS * c.barMs + 1);
    expect(after.pos[2]).toBeLessThan(12);
  });
});

describe("Lauflicht über die Govee-Lampen", () => {
  const sig = { base: "#112233", accent: "#ff0080", brightness: 1, pulse: 0 };
  it("die Lampe an der Lauflicht-Position strahlt, die anderen glimmen", () => {
    const states = [0, 1, 2, 3].map((index) => deviceStateFor({ ...sig, chase: 0.6 }, "grund", true, { index, count: 4 }));
    expect(states.map((s) => s.brightness)).toEqual([10, 10, 100, 10]);
    expect(states[2]!.color).toEqual({ r: 256, g: 0, b: 128 });
    // ohne Lauflicht wie bisher nach Rolle
    expect(deviceStateFor(sig, "grund", true, { index: 2, count: 4 }).brightness).toBe(45);
    // ausgeschaltet bleibt aus
    expect(deviceStateFor({ ...sig, chase: 0.6 }, "puls", false, { index: 2, count: 4 }).on).toBe(false);
  });

  it("Dashboard sendet das Lauflicht nur, wenn es läuft", () => {
    expect(JSON.parse(lightMessage({ signal: { ...sig, chase: -1 } }, true)).signal.chase).toBeUndefined();
    expect(JSON.parse(lightMessage({ signal: { ...sig, chase: 0.55 } }, true)).signal.chase).toBe(0.5);
  });
});

describe("Kamera auf schmalen Bildschirmen", () => {
  it("hochkant: Kamera rückt zurück und öffnet, bis dieselbe Bühnenbreite zu sehen ist", async () => {
    const { fitAspect, REF_ASPECT } = await import("@/lib/dance/evaluate");
    const cam: Cam = { pos: [0, 1.55, 2.3], target: [0, 1.42, 0], fov: 36 };
    expect(fitAspect(cam, REF_ASPECT)).toEqual({ cam, distance: 1 });
    expect(fitAspect(cam, 2.2).distance).toBe(1); // breiter bleibt unverändert
    const phone = 412 / 915;
    const { cam: c, distance } = fitAspect(cam, phone);
    expect(distance).toBeGreaterThan(2);
    expect(c.target).toEqual(cam.target);
    // sichtbare Breite am Blickziel: Abstand × tan(halber Bildwinkel) × Seitenverhältnis bleibt gleich
    const width = (k: typeof cam, a: number) =>
      Math.hypot(k.pos[0] - k.target[0], k.pos[1] - k.target[1], k.pos[2] - k.target[2]) * Math.tan((k.fov * Math.PI) / 360) * a;
    expect(width(c, phone)).toBeCloseTo(width(cam, REF_ASPECT), 6);
    expect(c.fov).toBeLessThan(60); // kein Fischauge
  });
});
