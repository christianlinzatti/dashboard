import { describe, expect, it } from "vitest";
import { planChoreography } from "@/lib/dance/plan";
import { liveShotAt, LIVE_CUT_BARS } from "@/lib/stage/screens";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";

const plan = planChoreography(neonlicht, 124);
const chorus = plan.phrases.find((p) => p.section === "chorus")!;
const slot = LIVE_CUT_BARS * plan.barMs;

describe("Bildregie der Live-Bildschirme", () => {
  it("deterministisch, Schnitt alle zwei Takte", () => {
    const t = chorus.startMs + 100;
    expect(liveShotAt(plan, t, [0, 0])).toEqual(liveShotAt(plan, t, [0, 0]));
    const names = Array.from({ length: 6 }, (_, i) => liveShotAt(plan, chorus.startMs + i * slot + 10, [0, 0]).name);
    expect(new Set(names).size).toBeGreaterThan(2);
    // innerhalb einer Einstellung derselbe Name
    const a = Math.ceil(chorus.startMs / slot) * slot;
    expect(liveShotAt(plan, a + 10, [0, 0]).name).toBe(liveShotAt(plan, a + slot - 10, [0, 0]).name);
  });

  it("Nahaufnahme zeigt auf den Kopf des Sängers", () => {
    const t = Array.from({ length: 12 }, (_, i) => chorus.startMs + i * slot + 10).find(
      (x) => liveShotAt(plan, x, [1.2, 0.4]).name === "saenger",
    )!;
    const s = liveShotAt(plan, t, [1.2, 0.4]);
    expect(s.target[0]).toBe(1.2);
    expect(s.target[2]).toBe(0.4);
    expect(s.target[1]).toBeGreaterThan(1.3);
    expect(s.pos[2]).toBeGreaterThan(0.4);
  });

  it("ohne Sänger keine Nahaufnahme", () => {
    for (let i = 0; i < 12; i++) expect(liveShotAt(plan, chorus.startMs + i * slot + 10, undefined).name).not.toBe("saenger");
  });
});

describe("Live-Bildschirme drosseln", () => {
  it("unter 26 fps halb so oft, unter 20 fps ein Viertel; zurück erst mit Puffer; ohne Messwert unverändert", async () => {
    const { screenEvery, screenThrottle } = await import("@/lib/stage/screens");
    expect(screenThrottle(40, 0)).toBe(0);
    expect(screenThrottle(25, 0)).toBe(1);
    expect(screenThrottle(19, 0)).toBe(2);
    // Puffer: bei 27 fps bleibt die Drosselung (Schwelle 26 + 4), erst ab 30 fps wieder normal
    expect(screenThrottle(27, 1)).toBe(1);
    expect(screenThrottle(30, 1)).toBe(0);
    expect(screenThrottle(22, 2)).toBe(2);
    expect(screenThrottle(24, 2)).toBe(1);
    expect(screenThrottle(null, 2)).toBe(2);
    expect([screenEvery(2, 0), screenEvery(2, 1), screenEvery(2, 2)]).toEqual([2, 4, 8]);
  });
});
