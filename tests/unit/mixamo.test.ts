import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { AnimationClip, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from "three";
import { packClip, unpackClip } from "@/lib/dance/clip-pack";
import {
  BONE_MAP,
  buildRig,
  estimateBpm,
  makeLoop,
  restFromGltf,
  retargetSamples,
  stripPrefix,
  type RestBone,
} from "@/lib/dance/retarget";

const AVATARS = join(process.cwd(), "public/avatars");
const gltf = (file: string) => {
  const b = readFileSync(join(AVATARS, file));
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString("utf8"));
};
const target = restFromGltf(gltf("atlas-prism.glb"));

/**
 * Künstliches Mixamo-Skelett in T-Pose mit absichtlich „krummen“ lokalen Achsen (jeder Knochen eigene
 * Welt-Rotation) – wie bei echten FBX-Dateien hängt das Ergebnis dann nicht an den lokalen Achsen.
 */
function mixamoSource() {
  const joints: Array<[string, string | null, [number, number, number]]> = [
    ["Hips", null, [0, 100, 0]],
    ["Spine", "Hips", [0, 110, 0]],
    ["Spine1", "Spine", [0, 122, 0]],
    ["Spine2", "Spine1", [0, 135, 0]],
    ["Neck", "Spine2", [0, 150, 0]],
    ["Head", "Neck", [0, 160, 0]],
    ["LeftShoulder", "Spine2", [6, 145, 0]],
    ["LeftArm", "LeftShoulder", [18, 145, 0]],
    ["LeftForeArm", "LeftArm", [45, 145, 0]],
    ["LeftHand", "LeftForeArm", [70, 145, 0]],
    ["LeftHandMiddle1", "LeftHand", [80, 145, 0]],
    ["RightShoulder", "Spine2", [-6, 145, 0]],
    ["RightArm", "RightShoulder", [-18, 145, 0]],
    ["RightForeArm", "RightArm", [-45, 145, 0]],
    ["RightHand", "RightForeArm", [-70, 145, 0]],
    ["RightHandMiddle1", "RightHand", [-80, 145, 0]],
    ["LeftUpLeg", "Hips", [10, 95, 0]],
    ["LeftLeg", "LeftUpLeg", [10, 52, 0]],
    ["LeftFoot", "LeftLeg", [10, 8, 0]],
    ["RightUpLeg", "Hips", [-10, 95, 0]],
    ["RightLeg", "RightUpLeg", [-10, 52, 0]],
    ["RightFoot", "RightLeg", [-10, 8, 0]],
  ];
  const root = new Object3D();
  const byName = new Map<string, Object3D>();
  const worldRot = new Map<string, Quaternion>();
  joints.forEach(([name, parent, pos], i) => {
    const o = new Object3D();
    o.name = `mixamorig${name}`; // wie FBXLoader (Doppelpunkt entfernt)
    const wr = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), i * 0.7);
    worldRot.set(name, wr);
    const p = parent ? byName.get(parent)! : root;
    const pr = parent ? worldRot.get(parent)! : new Quaternion();
    const pp = parent ? new Vector3(...joints.find((j) => j[0] === parent)![2]) : new Vector3();
    o.position.copy(new Vector3(...pos).sub(pp).applyQuaternion(pr.clone().invert()));
    o.quaternion.copy(pr.clone().invert().multiply(wr));
    p.add(o);
    byName.set(name, o);
  });
  root.updateMatrixWorld(true);

  // Animation: linker Arm hebt sich um 90° (Weltachse Z), Unterarm beugt zusätzlich, Hüfte wippt 2 cm
  const times = [0, 0.5, 1];
  const armWorld = (deg: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (deg * Math.PI) / 180);
  const localTrack = (name: string, worldDelta: (t: number) => Quaternion, parentDelta: (t: number) => Quaternion) =>
    new QuaternionKeyframeTrack(
      `mixamorig${name}.quaternion`,
      times,
      times.flatMap((t) => {
        const parentW = parentDelta(t).multiply(worldRot.get(joints.find((j) => j[0] === name)![1]!)!);
        const w = worldDelta(t).multiply(worldRot.get(name)!);
        return parentW.invert().multiply(w).toArray();
      }),
    );
  const id = () => new Quaternion();
  const arm = (t: number) => armWorld(90 * t);
  const fore = (t: number) => armWorld(90 * t + 45 * t);
  const clip = new AnimationClip("test", 1, [
    localTrack("LeftArm", arm, id),
    localTrack("LeftForeArm", fore, arm),
    new VectorKeyframeTrack("mixamorigHips.position", times, [0, 100, 0, 0, 102, 0, 0, 100, 0]),
  ]);
  return { root, byName, clip };
}

const dir = (a: Object3D, b: Object3D) => b.getWorldPosition(new Vector3()).sub(a.getWorldPosition(new Vector3())).normalize();

describe("Mixamo-Retargeting", () => {
  it("alle Avatare teilen dieselbe Grundpose (ein Clip passt auf alle)", () => {
    const files = readdirSync(AVATARS).filter((f) => f.endsWith(".glb"));
    expect(files.length).toBeGreaterThan(5);
    const key = (r: RestBone[]) =>
      JSON.stringify(
        r
          .filter((b) => Object.values(BONE_MAP).includes(b.name))
          .map((b) => [b.name, b.parent, b.position.map((v) => v.toFixed(3)), b.quaternion.map((v) => v.toFixed(3))]),
      );
    for (const f of files) expect(key(restFromGltf(gltf(f))), f).toBe(key(target));
  });

  it("entfernt Mixamo-Präfixe", () => {
    expect(stripPrefix("mixamorig:Hips")).toBe("Hips");
    expect(stripPrefix("mixamorig1:LeftArm")).toBe("LeftArm");
    expect(stripPrefix("mixamorigSpine2")).toBe("Spine2");
    expect(stripPrefix("Hips")).toBe("Hips");
  });

  it("Knochen zeigen in dieselbe Richtung wie in der Quelle – unabhängig von lokalen Achsen", () => {
    const src = mixamoSource();
    // Richtungen der Quelle in der Grundpose (vor dem Abspielen merken)
    const rest = new Map(
      [
        ["LeftArm", "LeftForeArm"],
        ["LeftForeArm", "LeftHand"],
        ["RightArm", "RightForeArm"],
        ["LeftUpLeg", "LeftLeg"],
      ].map(([a, b]) => [a!, dir(src.byName.get(a!)!, src.byName.get(b!)!)]),
    );
    const s = retargetSamples({ source: src.root, clip: src.clip, target, fps: 10 });
    expect(s.frames).toBe(11);
    expect(s.rotations.has("LeftArm")).toBe(true);
    expect(s.rotations.has("LeftIndex1")).toBe(false); // Finger bleiben in Grundpose

    const rig = buildRig(target);
    const pose = (f: number) => {
      for (const o of rig.order) {
        const r = s.rotations.get(o.name);
        if (r) o.quaternion.fromArray(r, f * 4);
      }
      rig.root.updateMatrixWorld(true);
    };
    const srcDir = (t: number, a: string) => {
      const arm = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (Math.PI / 2) * t);
      const base = rest.get(a)!.clone();
      if (a === "LeftArm") return base.applyQuaternion(arm);
      if (a === "LeftForeArm")
        return base.applyQuaternion(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI * 0.75 * t));
      return base;
    };
    for (const f of [0, 5, 10]) {
      pose(f);
      const t = f / 10;
      const angle = (a: string, b: string, sa: string) =>
        (dir(rig.byName.get(a)!, rig.byName.get(b)!).angleTo(srcDir(t, sa)) * 180) / Math.PI;
      expect(angle("LeftArm", "LeftForeArm", "LeftArm")).toBeLessThan(0.5);
      expect(angle("LeftForeArm", "LeftHand", "LeftForeArm")).toBeLessThan(0.5);
      // nicht animierte Knochen übernehmen die Richtung der (T-)Pose der Quelle
      expect(angle("RightArm", "RightForeArm", "RightArm")).toBeLessThan(0.5);
      expect(angle("LeftUpLeg", "LeftLeg", "LeftUpLeg")).toBeLessThan(0.5);
    }
  });

  it("Hüfte wippt maßstabsgetreu, ohne zu wandern", () => {
    const src = mixamoSource();
    const s = retargetSamples({ source: src.root, clip: src.clip, target, fps: 10 });
    const y = (f: number) => s.hips[f * 3 + 1]!;
    // Quelle: Hüfte 92 cm über dem Fuß, wippt 2 cm → Ziel proportional zur eigenen Hüfthöhe
    const rig = buildRig(target);
    const hipHeight =
      rig.byName.get("Hips")!.getWorldPosition(new Vector3()).y - rig.byName.get("LeftFoot")!.getWorldPosition(new Vector3()).y;
    expect(y(5) - y(0)).toBeCloseTo((2 / 92) * hipHeight, 3);
    expect(y(10)).toBeCloseTo(y(0), 5);
    expect(s.hips[5 * 3]).toBeCloseTo(s.hips[0]!, 5);
  });

  it("ohne Mixamo-Hüfte: verständlicher Fehler", () => {
    const src = new Object3D();
    expect(() => retargetSamples({ source: src, clip: new AnimationClip("x", 1, []), target })).toThrow(/Hips/);
  });

  it("Schleife ohne Sprung", () => {
    const frames = 20;
    const rot = new Float32Array(frames * 4);
    for (let f = 0; f < frames; f++) rot.set(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), f * 0.1).toArray(), f * 4);
    const hips = Float32Array.from({ length: frames * 3 }, (_, i) => (i % 3 === 1 ? Math.floor(i / 3) : 0));
    const loop = makeLoop({ fps: 10, frames, rotations: new Map([["Hips", rot]]), hips }, 4);
    expect(loop.frames).toBe(16);
    const q = loop.rotations.get("Hips")!;
    // Anfang = direkt hinter dem Ende der Schleife → Übergang Ende→Anfang stetig
    expect([...q.slice(0, 4)].map((v) => v.toFixed(4))).toEqual([...rot.slice(16 * 4, 17 * 4)].map((v) => v.toFixed(4)));
    expect([...q.slice(4 * 4, 5 * 4)]).toEqual([...rot.slice(4 * 4, 5 * 4)]);
    expect(loop.hips[1]).toBe(16);
    expect(makeLoop(loop, 0)).toBe(loop);
  });

  it("schätzt das Tempo aus dem Wippen der Hüfte", () => {
    const fps = 30;
    const wave = (bpm: number) => Array.from({ length: fps * 8 }, (_, i) => Math.sin((2 * Math.PI * (bpm / 60) * i) / fps));
    expect(estimateBpm(wave(120), fps)).toBeCloseTo(120, -1);
    expect(estimateBpm(wave(100), fps)).toBeCloseTo(100, -1);
    expect(estimateBpm(wave(60), fps)).toBeCloseTo(120, -1); // in 80–160 gefaltet
    expect(estimateBpm(new Array(fps * 4).fill(1), fps)).toBeNull();
    expect(estimateBpm([1, 2, 3], fps)).toBeNull();
  });
});

describe("Clip-Format", () => {
  it("packt kompakt und verlustarm, Schleife geschlossen", () => {
    const frames = 8;
    const rot = new Float32Array(frames * 4);
    for (let f = 0; f < frames; f++) rot.set(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), f * 0.2).toArray(), f * 4);
    const hips = Float32Array.from({ length: frames * 3 }, (_, i) => 0.96 + i * 0.001);
    const packed = packClip("Mixamo_Test", { fps: 25, frames, rotations: new Map([["LeftArm", rot]]), hips });
    expect(packed).toMatchObject({ v: 1, name: "Mixamo_Test", fps: 25, frames, bones: ["LeftArm"] });
    const clip = unpackClip(JSON.parse(JSON.stringify(packed)));
    expect(clip.name).toBe("Mixamo_Test");
    expect(clip.duration).toBeCloseTo(frames / 25);
    const q = clip.tracks.find((t) => t.name === "LeftArm.quaternion")!;
    expect(q.times).toHaveLength(frames + 1);
    q.values.slice(0, frames * 4).forEach((v, i) => expect(v).toBeCloseTo(rot[i]!, 4));
    expect([...q.values.slice(frames * 4)]).toEqual([...q.values.slice(0, 4)]);
    const h = clip.tracks.find((t) => t.name === "Hips.position")!;
    expect(h.values[0]).toBeCloseTo(0.96, 4);
  });

  it("erkennt kaputte Dateien", () => {
    const packed = packClip("x", { fps: 30, frames: 2, rotations: new Map(), hips: new Float32Array(6) });
    expect(() => unpackClip({ ...packed, frames: 3 })).toThrow(/Länge/);
    expect(() => unpackClip({ ...packed, v: 2 } as never)).toThrow(/Format/);
  });
});

describe("Mixamo-Lader", () => {
  it("lädt einmal, liefert stabil dasselbe Promise, Fehler blockieren nicht", async () => {
    vi.resetModules();
    vi.doMock("@/lib/dance/mixamo-clips.json", () => ({
      default: {
        clips: [
          {
            id: "Mixamo_A",
            source: "a.fbx",
            search: "A",
            energy: 2,
            genres: [],
            fallback: "Dance_Groove",
            file: "/animations/a.json",
          },
          {
            id: "Mixamo_B",
            source: "b.fbx",
            search: "B",
            energy: 2,
            genres: [],
            fallback: "Dance_House",
            file: "/animations/b.json",
          },
        ],
      },
    }));
    const { loadMixamo, loadedMixamo } = await import("@/lib/dance/mixamo-loader");
    const packed = packClip("Mixamo_A", { fps: 30, frames: 2, rotations: new Map(), hips: new Float32Array(6) });
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("a.json") ? new Response(JSON.stringify(packed)) : new Response("weg", { status: 404 }),
    );
    const p = loadMixamo(["Mixamo_A", "Mixamo_B"], fetchMock as unknown as typeof fetch);
    expect(loadMixamo(["Mixamo_A", "Mixamo_B"], fetchMock as unknown as typeof fetch)).toBe(p);
    await p;
    expect(loadedMixamo("Mixamo_A")?.name).toBe("Mixamo_A");
    expect(loadedMixamo("Mixamo_B")).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await loadMixamo(["Mixamo_A"], fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(2); // schon geladen
    await loadMixamo(["Mixamo_B"], fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(3); // Fehlschlag wird später erneut versucht
    vi.doUnmock("@/lib/dance/mixamo-clips.json");
  });
});

describe("Mixamo-Tänze in der Choreografie", () => {
  it("kommen zu den eingebauten Clips dazu, passen auf alle Avatare und werden bei passendem Genre bevorzugt", async () => {
    vi.resetModules();
    vi.doMock("@/lib/dance/mixamo-clips.json", () => ({
      default: {
        clips: [
          {
            id: "Mixamo_Samba",
            source: "s.fbx",
            search: "Samba",
            energy: 2,
            genres: ["latin"],
            fallback: "Dance_LatinSway",
            file: "/animations/s.json",
          },
          { id: "Mixamo_Rumba", source: "r.fbx", search: "Rumba", energy: 0, genres: [], fallback: "Dance_Waltz" },
        ],
      },
    }));
    const { planChoreography } = await import("@/lib/dance/plan");
    const { mixamoIdsIn } = await import("@/lib/dance/mixamo-loader");
    const { fallbackFor, mixamoClips, mixamoGenreBias } = await import("@/lib/dance/mixamo");
    const { neonlicht } = await import("@/lib/song-context/fixtures/neonlicht");

    expect(mixamoClips.map((c) => c.id)).toEqual(["Mixamo_Samba"]); // Rumba noch nicht umgewandelt
    expect(fallbackFor("Mixamo_Samba")).toBe("Dance_LatinSway");
    expect(fallbackFor("Dance_Groove")).toBeUndefined();
    expect(mixamoGenreBias(["Latin Pop"])).toEqual(["Mixamo_Samba"]);

    const count = (genres: string[]) => {
      let n = 0;
      for (let i = 0; i < 40; i++) {
        const song = { ...neonlicht, trackKey: `t${i}`, music: { ...neonlicht.music, genres } };
        const c = planChoreography(song, 124);
        n += mixamoIdsIn(c).length;
        for (const p of c.phrases)
          for (const m of Object.values(p.moves)) if (m.clip === "Mixamo_Samba") expect(p.energy).toBe(2);
      }
      return n;
    };
    const latin = count(["latin"]);
    expect(latin).toBeGreaterThan(count(["schlager"]));
    expect(latin).toBeGreaterThan(5);
    vi.doUnmock("@/lib/dance/mixamo-clips.json");
  });
});
