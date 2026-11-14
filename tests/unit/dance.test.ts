import { describe, expect, it } from "vitest";
import { avatarById } from "@/lib/avatars/catalog";
import { cameraAt, focusTimeline, layersAt, positionsAt } from "@/lib/dance/evaluate";
import { slots } from "@/lib/dance/formations";
import { contiguous, fallbackSections, planChoreography } from "@/lib/dance/plan";
import { rng } from "@/lib/dance/rng";
import { abendrot } from "@/lib/song-context/fixtures/abendrot";
import { instrumental } from "@/lib/song-context/fixtures/instrumental";
import { neonlicht } from "@/lib/song-context/fixtures/neonlicht";

describe("Zufall", () => {
  it("ist deterministisch pro Seed", () => {
    const a = rng("x");
    const b = rng("x");
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    expect(rng("y").next()).not.toBe(rng("x").next());
  });
});

describe("Choreografie-Plan", () => {
  const plan = planChoreography(neonlicht, 124);

  it("deckt den ganzen Song lückenlos ab", () => {
    expect(plan.phrases[0]!.startMs).toBe(0);
    expect(plan.phrases.at(-1)!.endMs).toBe(neonlicht.track.durationMs);
    for (let i = 1; i < plan.phrases.length; i++) expect(plan.phrases[i]!.startMs).toBe(plan.phrases[i - 1]!.endMs);
  });

  it("Phrasen sind 4–20 Takte lang oder enden an Abschnittsgrenzen", () => {
    const boundaries = new Set(neonlicht.lyrics!.sections.flatMap((s) => [s.startMs, s.endMs]));
    for (const p of plan.phrases) {
      const bars = (p.endMs - p.startMs) / plan.barMs;
      expect(bars <= 20.01 || boundaries.has(p.endMs)).toBe(true);
    }
  });

  it("nutzt nur Clips, die der jeweilige Avatar hat", () => {
    for (const p of plan.phrases)
      for (const [id, m] of Object.entries(p.moves)) expect(avatarById.get(id)!.clips).toContain(m.clip);
  });

  it("Refrains synchron, Strophen mit unterschiedlichen Tänzen", () => {
    const chorus = plan.phrases.filter((p) => p.section === "chorus");
    expect(chorus.length).toBeGreaterThan(0);
    for (const p of chorus) expect(new Set(Object.values(p.moves).map((m) => m.clip)).size).toBe(1);
    const verse = plan.phrases.filter((p) => p.section === "verse");
    expect(verse.some((p) => new Set(Object.values(p.moves).map((m) => m.clip)).size > 1)).toBe(true);
  });

  it("Wiederholungssperre: Lead wiederholt einen Clip frühestens nach 4 anderen", () => {
    const lead = plan.order[0]!;
    const seq = plan.phrases.map((p) => p.moves[lead]!.clip).filter((c, i, a) => i === 0 || c !== a[i - 1]);
    for (let i = 0; i < seq.length; i++) {
      const window = seq.slice(Math.max(0, i - 4), i);
      // nur wenn der Pool groß genug war (Energiestufe wechselt) – hier reicht er immer
      expect(window).not.toContain(seq[i]);
    }
  });

  it("Lead winkt zum Start, Formation wechselt zwischen Phrasen", () => {
    expect(plan.phrases[0]!.moves[plan.order[0]!]!.clip).toBe("Gesture_Wave");
    const formations = plan.phrases.map((p) => p.formation);
    for (let i = 1; i < formations.length; i++)
      if (formations[i] === formations[i - 1]) expect(plan.phrases[i]!.section).toBe("outro");
  });

  it("ist pro Song deterministisch und unterscheidet sich zwischen Songs", () => {
    expect(planChoreography(neonlicht, 124)).toEqual(plan);
    const other = planChoreography({ ...neonlicht, trackKey: "anders" }, 124);
    expect(other.phrases.map((p) => p.moves[p === other.phrases[0] ? "x" : other.order[1]!]?.clip)).not.toEqual(
      plan.phrases.map((p) => p.moves[p === plan.phrases[0] ? "x" : plan.order[1]!]?.clip),
    );
  });

  it("ruhige Songs tanzen ruhiger als energetische", () => {
    const calm = planChoreography(abendrot, 84);
    const avg = (c: typeof calm) => c.phrases.reduce((s, p) => s + p.energy, 0) / c.phrases.length;
    expect(avg(calm)).toBeLessThan(avg(plan));
  });

  it("Songs ohne Lyrics bekommen geschätzte Abschnitte", () => {
    const p = planChoreography(instrumental, 132);
    expect(p.phrases[0]!.section).toBe("intro");
    expect(p.phrases.at(-1)!.section).toBe("outro");
    expect(new Set(p.phrases.map((x) => x.section))).toContain("instrumental");
    expect(fallbackSections(60_000, 2000).at(-1)!.endMs).toBe(60_000);
  });

  it("contiguous schließt Lücken und entfernt Überlappungen", () => {
    const s = contiguous(
      [
        { kind: "verse", startMs: 5000, endMs: 10_000 },
        { kind: "chorus", startMs: 12_000, endMs: 20_000 },
        { kind: "verse", startMs: 18_000, endMs: 25_000 },
      ],
      30_000,
    );
    expect(s.map((x) => [x.kind, x.startMs, x.endMs])).toEqual([
      ["intro", 0, 5000],
      ["verse", 5000, 12_000],
      ["chorus", 12_000, 20_000],
      ["verse", 20_000, 30_000],
    ]);
  });
});

describe("Auswertung zur Songzeit", () => {
  const plan = planChoreography(neonlicht, 124);
  const lead = plan.order[0]!;

  it("blendet beim Phrasenwechsel über einen Schlag über", () => {
    const i = plan.phrases.findIndex((p, k) => k > 0 && p.moves[lead]!.clip !== plan.phrases[k - 1]!.moves[lead]!.clip);
    const p = plan.phrases[i]!;
    const mid = layersAt(plan, lead, p.startMs + plan.beatMs / 2);
    expect(mid).toHaveLength(2);
    expect(mid[0]!.weight + mid[1]!.weight).toBeCloseTo(1);
    expect(layersAt(plan, lead, p.startMs + plan.beatMs * 2)).toHaveLength(1);
  });

  it("Clip-Zeit läuft mit dem Tempo", () => {
    const p = plan.phrases[3]!;
    const a = layersAt(plan, lead, p.startMs + 2 * plan.beatMs)[0]!;
    const b = layersAt(plan, lead, p.startMs + 3 * plan.beatMs)[0]!;
    expect(b.time - a.time).toBeCloseTo(0.5); // 1 Schlag = 0,5 s Clip-Zeit
  });

  it("aktiver Sänger tritt nach vorn", () => {
    const timeline = focusTimeline(neonlicht);
    expect(timeline.map((s) => s.artistId)).toContain("demo-kai");
    const avatarOf = (id?: string) => neonlicht.cast.find((c) => c.artistId === id)?.avatarId;
    const t = 68_500; // Kai Vento singt (seit 60,5 s)
    const pos = positionsAt(plan, t, { timeline, avatarOf });
    const phrase = plan.phrases.find((p) => p.startMs <= t && t < p.endMs)!;
    // Kai steht auf dem Platz, der in der Formation dem Lead gehört
    expect(pos["atlas-prism"]![0]).toBeCloseTo(phrase.positions[lead]![0], 1);
  });

  it("Kamera liefert gültige Werte", () => {
    for (const t of [0, 30_000, 45_000, 199_000]) {
      const c = cameraAt(plan, t);
      expect(c.pos.every(Number.isFinite)).toBe(true);
      expect(c.pos[2]).toBeGreaterThan(3);
    }
  });

  it("Formationen haben eindeutige Plätze, Platz 0 vorn in der Mitte", () => {
    for (const f of ["linie", "v", "halbkreis", "spotlight"] as const) {
      const s = slots(f, 5);
      expect(new Set(s.map((p) => p.join())).size).toBe(5);
      expect(s[0]![0]).toBe(0);
    }
  });
});
