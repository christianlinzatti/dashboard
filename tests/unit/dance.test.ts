import { describe, expect, it } from "vitest";
import { avatarById } from "@/lib/avatars/catalog";
import { mixamoById } from "@/lib/dance/mixamo";
import { cameraAt, focusTimeline, layersAt, positionsAt, rotateOnStage, stageAngleAt } from "@/lib/dance/evaluate";
import { Vector3 } from "three";
import { fixtures } from "@/lib/song-context/fixtures";
import { hoshizora } from "@/lib/song-context/fixtures/hoshizora";
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

  it("nutzt nur Clips, die der jeweilige Avatar hat (Mixamo-Tänze passen auf alle)", () => {
    for (const p of plan.phrases)
      for (const [id, m] of Object.entries(p.moves))
        if (!mixamoById.has(m.clip)) expect(avatarById.get(id)!.clips).toContain(m.clip);
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

  it("auch gefolgte Feature-Artists winken zum Start, nicht gefolgte tanzen", () => {
    const kai = neonlicht.cast.find((c) => c.artistId === "demo-kai")!.avatarId;
    expect(plan.phrases[0]!.moves[kai]!.clip).not.toBe("Gesture_Wave"); // Kai wird nicht gefolgt
    const followed = {
      ...neonlicht,
      user: { ...neonlicht.user!, artists: { ...neonlicht.user!.artists, "demo-kai": { following: true } } },
    };
    const p2 = planChoreography(followed, 124);
    expect(p2.phrases[0]!.moves[kai]!.clip).toBe("Gesture_Wave");
    expect(p2.phrases[1]!.moves[kai]!.clip).not.toBe("Gesture_Wave"); // nur die erste Phrase
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
    for (let t = 0; t < 200_000; t += 1000) {
      const c = cameraAt(plan, t);
      expect([...c.pos, ...c.target].every(Number.isFinite)).toBe(true);
      // nie im Boden und nie mitten in den Tänzern
      expect(c.pos[1]).toBeGreaterThan(0.3);
      expect(Math.hypot(c.pos[0], c.pos[2])).toBeGreaterThan(2);
    }
  });

  it("Kamera-Einstellungen: Nahaufnahme folgt dem Sänger, Kreisfahrt umrundet die Bühne, Zoom fährt heran", () => {
    const at = (cam: string) => plan.phrases.find((p) => p.camera === cam);
    const nah = at("nah")!;
    const mid = (p: { startMs: number; endMs: number }) => (p.startMs + p.endMs) / 2;
    const left = cameraAt(plan, mid(nah), [-1.5, 0.5]);
    const right = cameraAt(plan, mid(nah), [1.5, 0.5]);
    expect(left.target[0]).toBeCloseTo(-1.5, 1); // Handkamera wackelt leicht
    expect(right.target[0]).toBeCloseTo(1.5, 1);
    expect(left.target[1]).toBeGreaterThan(1.2); // Gesicht/Oberkörper
    expect(left.pos[2] - left.target[2]).toBeLessThan(3); // nah dran

    const kreis = at("kreisfahrt")!;
    expect(cameraAt(plan, mid(kreis)).pos[2]).toBeLessThan(-4); // hinter der Bühne
    const quarter = kreis.startMs + (kreis.endMs - kreis.startMs) * 0.3;
    expect(Math.abs(cameraAt(plan, quarter).pos[0])).toBeGreaterThan(3); // seitlich
    expect(cameraAt(plan, kreis.endMs - 1).pos[2]).toBeGreaterThan(5); // wieder vorn

    const p2 = planChoreography(hoshizora, 132);
    const zoom = p2.phrases.find((p) => p.camera === "zoom")!;
    const dist = (t: number) => Math.hypot(...cameraAt(p2, t).pos.map((v, i) => v - [0, 1, 0][i]!));
    expect(dist(zoom.endMs - 1)).toBeLessThan(dist(zoom.startMs + 100) - 2);
    expect(cameraAt(p2, p2.phrases.find((p) => p.camera === "vogel")!.startMs + 8000).pos[1]).toBeGreaterThan(6);
  });

  it("Drehbühne: eine volle Umdrehung pro Phrase, nur in passenden Abschnitten", () => {
    const plans = Object.values(fixtures).map((s) => planChoreography(s, s.music.bpmHint ?? 120));
    const turns = plans.flatMap((c) => c.phrases.filter((p) => p.turn).map((p) => ({ c, p })));
    expect(turns.length).toBeGreaterThan(0);
    for (const { c, p } of turns) {
      expect(["chorus", "instrumental", "bridge"]).toContain(p.section);
      expect(["kreisfahrt", "nah"]).not.toContain(p.camera);
      expect(stageAngleAt(c, p.startMs)).toBeCloseTo(0);
      expect(stageAngleAt(c, (p.startMs + p.endMs) / 2)).toBeCloseTo(Math.PI);
      expect(stageAngleAt(c, p.endMs - 1)).toBeCloseTo(2 * Math.PI, 2);
    }
    const still = plans[0]!.phrases.find((p) => !p.turn)!;
    expect(stageAngleAt(plans[0]!, still.startMs + 500)).toBe(0);
    // gleiche Drehrichtung wie three.js (Object3D.rotation.y)
    const v = new Vector3(1.2, 0, 0.4).applyAxisAngle(new Vector3(0, 1, 0), 0.8);
    const [x, z] = rotateOnStage([1.2, 0.4], 0.8);
    expect(x).toBeCloseTo(v.x);
    expect(z).toBeCloseTo(v.z);
    expect(rotateOnStage([1, 2], 0)).toEqual([1, 2]);
  });

  it("Formationen haben eindeutige Plätze, Platz 0 vorn in der Mitte", () => {
    for (const f of ["linie", "v", "halbkreis", "spotlight"] as const) {
      const s = slots(f, 5);
      expect(new Set(s.map((p) => p.join())).size).toBe(5);
      expect(s[0]![0]).toBe(0);
    }
  });
});
