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
  sourceBoneName,
  stripPrefix,
  type RestBone,
} from "@/lib/dance/retarget";

// Quell-Avatare (public/avatars entsteht erst beim Build)
const AVATARS = join(process.cwd(), "avatars");
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

  it("Skelette im Unreal-Stil (Mesh2Motion) ergeben dieselbe Bewegung wie Mixamo", () => {
    expect(sourceBoneName("pelvis")).toBe("Hips");
    expect(sourceBoneName("spine_03")).toBe("Spine2");
    expect(sourceBoneName("upperarm_l")).toBe("LeftArm");
    expect(sourceBoneName("calf_r")).toBe("RightLeg");
    expect(sourceBoneName("mixamorig:LeftHand")).toBe("LeftHand");

    const ue: Record<string, string> = { Hips: "pelvis", Spine: "spine_01", Spine1: "spine_02", Spine2: "spine_03" };
    Object.assign(ue, { Neck: "neck_01", Head: "head" });
    for (const [s, side] of [
      ["l", "Left"],
      ["r", "Right"],
    ])
      Object.assign(ue, {
        [`${side}Shoulder`]: `clavicle_${s}`,
        [`${side}Arm`]: `upperarm_${s}`,
        [`${side}ForeArm`]: `lowerarm_${s}`,
        [`${side}Hand`]: `hand_${s}`,
        [`${side}HandMiddle1`]: `middle_01_${s}`,
        [`${side}UpLeg`]: `thigh_${s}`,
        [`${side}Leg`]: `calf_${s}`,
        [`${side}Foot`]: `foot_${s}`,
      });
    const mix = mixamoSource();
    const unreal = mixamoSource();
    unreal.root.traverse((o) => (o.name = ue[stripPrefix(o.name)] ?? o.name));
    const tracks = unreal.clip.tracks.map((t) => {
      const c = t.clone();
      const [bone, prop] = t.name.split(".");
      c.name = `${ue[stripPrefix(bone!)]}.${prop}`;
      return c;
    });
    const a = retargetSamples({ source: mix.root, clip: mix.clip, target, fps: 10 });
    const b = retargetSamples({ source: unreal.root, clip: new AnimationClip("ue", 1, tracks), target, fps: 10 });
    expect([...b.rotations.keys()]).toEqual([...a.rotations.keys()]);
    for (const [k, v] of a.rotations) expect(Array.from(b.rotations.get(k)!)).toEqual(Array.from(v));
    expect(Array.from(b.hips)).toEqual(Array.from(a.hips));
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

describe("Umwandlung in Node", () => {
  it("Texturen in FBX-Dateien „With Skin“ brechen nicht ab (kein DOM in Node)", async () => {
    const { TextureLoader } = await import("three");
    const { installImageStub } = await import("@/scripts/mixamo/no-dom");
    const g = globalThis as { document?: unknown };
    const before = g.document;
    delete g.document;
    expect(() => new TextureLoader().load("figur.png")).toThrow(/document/);
    const uninstall = installImageStub();
    expect(() => new TextureLoader().load("figur.png")).not.toThrow();
    expect(installImageStub()).toBeTypeOf("function"); // zweimal ist harmlos
    uninstall();
    expect(g.document).toBeUndefined();
    if (before) g.document = before;
  });
});

describe("Schleifenlänge", () => {
  it("ganze Takte, Überblendung bei kurzen Aufnahmen gekürzt", async () => {
    const { loopLength } = await import("@/scripts/mixamo/convert");
    const beat = (30 * 60) / 105.9; // 17 Frames
    expect(loopLength(30 * 20, beat)).toEqual({ beats: 32, blend: 8 }); // 20 s: viele Takte, halbe Schlaglänge
    expect(loopLength(72, beat)).toEqual({ beats: 4, blend: 4 }); // Rumba: 2,4 s reichen nur mit kurzer Blende
    expect(loopLength(60, beat).beats).toBe(0); // kürzer als ein Takt
  });

  it("kurze Mesh2Motion-Schleifen: ganze Schläge je Durchlauf, ganze Takte insgesamt", async () => {
    const { cycleTempo, repeatClip } = await import("@/scripts/mixamo/convert");
    // 1,2 s bei geschätzten ~100 BPM = 2 Schläge → 2 Durchläufe für einen Takt
    expect(cycleTempo(1.2, 99)).toEqual({ bpm: 100, beatsPerCycle: 2, repeats: 2 });
    expect(cycleTempo(1.92, 120)).toEqual({ bpm: 125, beatsPerCycle: 4, repeats: 1 });
    expect(cycleTempo(2.51, 106)).toMatchObject({ beatsPerCycle: 4, repeats: 1 });
    expect(cycleTempo(1, 170)).toMatchObject({ beatsPerCycle: 3, repeats: 4 });

    const clip = new AnimationClip("x", 1, [new VectorKeyframeTrack("Hips.position", [0, 0.5, 1], [0, 0, 0, 0, 1, 0, 0, 0, 0])]);
    const r = repeatClip(clip, 3);
    expect(r.duration).toBe(3);
    expect(Array.from(r.tracks[0]!.times)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
    expect(Array.from(r.tracks[0]!.values).filter((_, i) => i % 3 === 1)).toEqual([0, 1, 0, 1, 0, 1, 0]);
    expect(r.tracks[0]).toBeInstanceOf(VectorKeyframeTrack);
  });
});

describe("CMU-Motion-Capture (BVH)", () => {
  /** Mini-BVH im CMU-Aufbau; Tänzer steht die ganze Zeit um 90° gedreht (seitlich zur Kamera). */
  const joint = (name: string, offset: string, inner: string) =>
    `JOINT ${name}\n{\nOFFSET ${offset}\nCHANNELS 3 Zrotation Yrotation Xrotation\n${inner}}\n`;
  const end = (offset: string) => `End Site\n{\nOFFSET ${offset}\n}\n`;
  const bvh = (yaw: number) => `HIERARCHY
ROOT Hips
{
OFFSET 0 0 0
CHANNELS 6 Xposition Yposition Zposition Zrotation Yrotation Xrotation
${joint("LeftUpLeg", "1 -1 0", end("0 -8 0"))}${joint("RightUpLeg", "-1 -1 0", end("0 -8 0"))}${joint(
    "LowerBack",
    "0 1 0",
    joint("Spine", "0 2 0", joint("Spine1", "0 2 0", end("0 2 0"))),
  )}}
MOTION
Frames: 3
Frame Time: 0.5
0 17 0 0 ${yaw} 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
1 17 0 0 ${yaw} 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
2 17 0 0 ${yaw} 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
`;

  it("benennt den CMU-Rücken auf Mixamo-Namen um – Knochen und Spuren", async () => {
    const { loadBvh } = await import("@/scripts/mixamo/convert");
    const { group, animations } = loadBvh(bvh(0));
    const names: string[] = [];
    group.traverse((o) => names.push(o.name));
    expect(names).toEqual(expect.arrayContaining(["Hips", "Spine", "Spine1", "Spine2", "LeftUpLeg"]));
    expect(names).not.toContain("LowerBack");
    expect(animations[0]!.tracks.map((t) => t.name)).toContain("Spine2.quaternion");
    // Ruhehöhe der Hüfte aus der Aufnahme (17), nicht der Ursprung – sonst „springt“ der Avatar 17 Einheiten hoch
    expect(group.getObjectByName("Hips")!.position.y).toBe(17);
  });

  it("dreht seitlich aufgenommene Tänzer zur Kamera, Wege um die Hochachse mit", async () => {
    const { faceForward, loadBvh } = await import("@/scripts/mixamo/convert");
    const { group, animations } = loadBvh(bvh(90));
    const clip = animations[0]!;
    expect(faceForward(group, clip)).toBeCloseTo(-90, 0);
    // danach: Hüfte ohne Drehung, Weg (x 0 → 2) zeigt jetzt in z-Richtung
    const q = clip.tracks.find((t) => t.name === "Hips.quaternion")!;
    expect(new Quaternion().fromArray(q.values, 0).angleTo(new Quaternion())).toBeLessThan(1e-4);
    const p = clip.tracks.find((t) => t.name === "Hips.position")!;
    expect(Math.abs(p.values[6]!)).toBeLessThan(1e-4);
    expect(Math.abs(p.values[8]!)).toBeCloseTo(2, 4);
    // Ruhepose bleibt unangetastet (das Retargeting liest sie)
    const hips = group.getObjectByName("Hips")!;
    expect(hips.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6);
    // schon nach vorn: keine Drehung
    const straight = loadBvh(bvh(0));
    expect(faceForward(straight.group, straight.animations[0]!)).toBeCloseTo(0, 3);
  });

  it("Name, ID und Ausschnitt aus dem Dateinamen", async () => {
    const { autoEntry, baseName, idFromFile } = await import("@/scripts/mixamo/auto");
    expect(baseName("charleston-fancy_93_08.bvh")).toBe("Charleston Fancy");
    expect(idFromFile("salsa_60_01.bvh")).toBe("CMU_Salsa_60_01");
    expect(autoEntry("lambada_55_02.bvh")).toMatchObject({ genres: ["latin"], start: 0.1, end: 16.1 });
  });
});

describe("Automatisch aufgenommene Tänze", () => {
  it("Name, ID und Stil aus dem Dateinamen – auch für Browser-Nummern", async () => {
    const { autoEntry, baseName, idFromFile, styleFromName } = await import("@/scripts/mixamo/auto");
    expect(baseName("Hip Hop Dancing (2).fbx")).toBe("Hip Hop Dancing");
    expect(idFromFile("Hip Hop Dancing (2).fbx")).toBe("Mixamo_HipHopDancing_2");
    expect(idFromFile("Hip Hop Dancing.fbx")).toBe("Mixamo_HipHopDancing");
    expect(idFromFile("Bachata Ö-Step.FBX")).toBe("Mixamo_BachataOStep");
    // Mesh2Motion: Dateinamen mit Bindestrichen
    expect(baseName("dance-body-roll.glb")).toBe("Dance Body Roll");
    expect(idFromFile("dance-charleston.glb")).toBe("M2M_DanceCharleston");
    expect(styleFromName(baseName("dance-charleston.glb")).fallback).toBe("Dance_JazzSwing");
    expect(styleFromName("Wave Hip Hop Dance").fallback).toBe("Dance_Robot");
    expect(styleFromName("Hip Hop Dancing").genres).toContain("hip hop");
    expect(styleFromName("Breakdance Freeze Var 4").fallback).toBe("Dance_PowerHit");
    expect(styleFromName("Tango").genres).toEqual(["latin"]);
    expect(styleFromName("Irgendwas")).toEqual({ genres: ["pop", "dance"], fallback: "Dance_Groove" });
    expect(autoEntry("Salsa Dancing (3).fbx")).toMatchObject({
      id: "Mixamo_SalsaDancing_3",
      source: "Salsa Dancing (3).fbx",
      search: "Salsa Dancing",
      genres: ["latin"],
      auto: true,
    });
  });

  it("Energie aus der Bewegung passt zu den umgewandelten Tänzen", async () => {
    const { energyFromMotion } = await import("@/scripts/mixamo/auto");
    const { unpackClip } = await import("@/lib/dance/clip-pack");
    const energyOf = (id: string) => {
      const clip = unpackClip(JSON.parse(readFileSync(join(process.cwd(), "public/animations", `${id}.json`), "utf8")));
      const q = clip.tracks.filter((t) => t.name.endsWith(".quaternion"));
      const frames = q[0]!.times.length;
      const fps = (frames - 1) / clip.duration;
      return energyFromMotion({
        fps,
        frames,
        rotations: new Map(q.map((t) => [t.name.split(".")[0]!, Float32Array.from(t.values)])),
        hips: Float32Array.from(clip.tracks.find((t) => t.name === "Hips.position")!.values),
      });
    };
    // echte Tänze: ruhig < wild (die Dateien kommen von Mixamo und können sich ändern → nur die Reihenfolge)
    expect(energyOf("Mixamo_Bellydance")).toBeLessThan(energyOf("Mixamo_Breakdance"));
    expect(energyOf("Mixamo_Breakdance")).toBe(3);
    // künstliche Bewegung: Arme/Beine pendeln mit wachsender Geschwindigkeit
    const swing = (radPerSec: number) => {
      const fps = 30;
      const frames = 61;
      const rot = new Float32Array(frames * 4);
      for (let f = 0; f < frames; f++)
        rot.set(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.sin(f / 10) * radPerSec * 0.33).toArray(), f * 4);
      const bones = ["Hips", "Spine", "LeftArm", "RightArm", "LeftUpLeg", "RightUpLeg"];
      return energyFromMotion({
        fps,
        frames,
        rotations: new Map(bones.map((b) => [b, rot])),
        hips: new Float32Array(frames * 3),
      });
    };
    expect([swing(1), swing(2.5), swing(4.5), swing(8)]).toEqual([0, 1, 2, 3]);
    // Stillstand → ruhig
    expect(
      energyFromMotion({
        fps: 30,
        frames: 3,
        rotations: new Map([["Hips", new Float32Array(12).fill(0.5)]]),
        hips: new Float32Array(9),
      }),
    ).toBe(0);
  });
});

describe("Großer Katalog", () => {
  it("Übergänge werden erkannt und nicht eingeplant; fremder Stil seltener", async () => {
    vi.resetModules();
    const entry = (id: string, genres: string[], extra = {}) => ({
      id,
      source: `${id}.fbx`,
      search: id,
      energy: 2,
      genres,
      fallback: "Dance_Groove",
      file: `/animations/${id}.json`,
      ...extra,
    });
    vi.doMock("@/lib/dance/mixamo-clips.json", () => ({
      default: {
        clips: [
          entry("Mixamo_Break", ["hip hop", "breakbeat"]),
          entry("Mixamo_Party", ["pop", "dance"]),
          entry("Mixamo_ToIdle", ["hip hop"], { skip: true }),
        ],
      },
    }));
    const { isTransition, mixamoClips, mixamoOffStyle } = await import("@/lib/dance/mixamo");
    const { planChoreography } = await import("@/lib/dance/plan");
    const { neonlicht } = await import("@/lib/song-context/fixtures/neonlicht");

    expect(isTransition("Breakdance Footwork To Idle")).toBe(true);
    expect(isTransition("Breakdance Uprock Var 1 End")).toBe(true);
    expect(isTransition("breakdance ending 3")).toBe(true);
    expect(isTransition("Bboy Uprock Start")).toBe(true);
    expect(isTransition("Breakdance Freezes")).toBe(false);
    expect(isTransition("Dancing Running Man")).toBe(false);
    expect(mixamoClips.map((c) => c.id)).toEqual(["Mixamo_Break", "Mixamo_Party"]);
    expect([...mixamoOffStyle(["swing"])]).toEqual(["Mixamo_Break"]);
    expect([...mixamoOffStyle(["hip hop"])]).toEqual([]);

    const uses = (genres: string[], clip: string) => {
      let n = 0;
      for (let i = 0; i < 60; i++) {
        const c = planChoreography({ ...neonlicht, trackKey: `k${i}`, music: { ...neonlicht.music, genres } }, 124);
        for (const p of c.phrases) for (const m of Object.values(p.moves)) if (m.clip === clip) n++;
        for (const p of c.phrases) for (const m of Object.values(p.moves)) expect(m.clip).not.toBe("Mixamo_ToIdle");
      }
      return n;
    };
    // Swing-Song: Breakdance seltener als der neutrale Party-Tanz; Hip-Hop-Song: Breakdance öfter
    expect(uses(["swing"], "Mixamo_Break")).toBeLessThan(uses(["swing"], "Mixamo_Party"));
    expect(uses(["hip hop"], "Mixamo_Break")).toBeGreaterThan(uses(["swing"], "Mixamo_Break"));
    vi.doUnmock("@/lib/dance/mixamo-clips.json");
  });

  it("automatische Einträge für Übergänge sind übersprungen", async () => {
    const { autoEntry } = await import("@/scripts/mixamo/auto");
    expect(autoEntry("Breakdance Footwork To Idle (2).fbx").skip).toBe(true);
    expect(autoEntry("Hip Hop Dancing (7).fbx").skip).toBeUndefined();
  });
});

describe("Doppelte Tänze", () => {
  const loadSig = async (id: string) => {
    const { unpackClip } = await import("@/lib/dance/clip-pack");
    const { motionSignature } = await import("@/scripts/mixamo/auto");
    const clip = unpackClip(JSON.parse(readFileSync(join(process.cwd(), "public/animations", `${id}.json`), "utf8")));
    const rot = new Map(
      clip.tracks.filter((t) => t.name.endsWith(".quaternion")).map((t) => [t.name.split(".")[0]!, t.values] as const),
    );
    return { rot, frames: clip.tracks[0]!.times.length - 1, sig: motionSignature(rot, clip.tracks[0]!.times.length - 1) };
  };

  it("derselbe Tanz (auch leicht verrauscht) gilt als doppelt, Varianten nicht", async () => {
    const { DUPLICATE_DISTANCE, motionSignature, signatureDistance } = await import("@/scripts/mixamo/auto");
    // zwei beliebige verschiedene Tänze aus dem Katalog (Dateien ändern sich mit neuen Downloads)
    const { default: catalog } = await import("@/lib/dance/mixamo-clips.json");
    const [first, second] = (catalog.clips as Array<{ id: string; file?: string }>).filter((c) => c.file);
    const a = await loadSig(first!.id);
    const b = await loadSig(second!.id);
    // erneuter Download: minimale Abweichungen durch Rundung
    const noisy = new Map([...a.rot].map(([k, v]) => [k, Float32Array.from(v, (x, i) => x + ((i % 7) - 3) * 1e-4)] as const));
    expect(signatureDistance(a.sig, motionSignature(noisy, a.frames))).toBeLessThan(DUPLICATE_DISTANCE);
    expect(signatureDistance(a.sig, b.sig)).toBeGreaterThan(DUPLICATE_DISTANCE * 3);
    expect(signatureDistance(a.sig, [])).toBe(Infinity);
  });

  it("der Katalog im Repo enthält keinen Tanz doppelt", async () => {
    const { default: catalog } = await import("@/lib/dance/mixamo-clips.json");
    const { DUPLICATE_DISTANCE, signatureDistance } = await import("@/scripts/mixamo/auto");
    const entries = (catalog.clips as Array<{ id: string; file?: string; duplicateOf?: string }>).filter((c) => c.file);
    const sigs = await Promise.all(entries.map(async (e) => [e.id, (await loadSig(e.id)).sig] as const));
    const twins: string[] = [];
    for (let i = 0; i < sigs.length; i++)
      for (let j = i + 1; j < sigs.length; j++)
        if (signatureDistance(sigs[i]![1], sigs[j]![1]) < DUPLICATE_DISTANCE) twins.push(`${sigs[i]![0]} = ${sigs[j]![0]}`);
    expect(twins).toEqual([]);
    // als doppelt markierte Einträge verweisen auf einen vorhandenen Tanz und werden nicht eingeplant
    for (const d of (catalog.clips as Array<{ id: string; duplicateOf?: string; skip?: boolean; file?: string }>).filter(
      (c) => c.duplicateOf,
    )) {
      expect(entries.map((e) => e.id)).toContain(d.duplicateOf);
      expect(d.skip).toBe(true);
      expect(d.file).toBeUndefined();
    }
  });
});

describe("Keine Tänze, Bühnengesten, gesicherte Tänze", () => {
  it("Kampf, Waffen, Gehen, Alltag werden übersprungen – Tänze und Bühnengesten nicht", async () => {
    const { skipReason, styleFromName, preservedId } = await import("@/scripts/mixamo/auto");
    for (const n of [
      "Drop Kick",
      "Grab Rifle From The Side",
      "Zombie Walk",
      "Texting While Standing",
      "Jogging",
      "Hit On Back Of Head",
    ])
      expect(skipReason(n), n).toBe("kein Tanz");
    for (const n of ["Dancing Running Man", "Guitar Playing", "Cheering", "Standing Clap", "Thriller Part 3", "Macarena Dance"])
      expect(skipReason(n), n).toBeUndefined();
    expect(skipReason("Happy Idle")).toBe("Übergang");
    expect(styleFromName("Guitar Playing").genres).toContain("rock");
    expect(styleFromName("Playing Drums").fallback).toBe("Dance_RockDrive");
    expect(styleFromName("Standing Clap").genres).toContain("party");
    expect(styleFromName("Macaco Side").genres).toContain("brazil");
    expect(styleFromName("Northern Soul Spin").genres).toContain("soul");
    expect(preservedId("Mixamo_X", new Set())).toBe("Mixamo_X_alt");
    expect(preservedId("Mixamo_X", new Set(["Mixamo_X_alt", "Mixamo_X_alt2"]))).toBe("Mixamo_X_alt3");
  });

  it("Bewegungen, Reaktionen und Posen sind kein Tanz – der Moonwalk schon", async () => {
    const { skipReason } = await import("@/scripts/mixamo/auto");
    for (const n of [
      "Crawling",
      "Headbutt",
      "Header",
      "Kettlebell Swing",
      "Leg Sweep",
      "Right Turn",
      "left turn 90",
      "Strafe",
      "Stand To Cover",
      "Standing React Small From Back",
      "Drunk Run Forward",
      "Female Standing Pose",
      "Swing To Land",
      "Pointing Gesture",
    ])
      expect(skipReason(n), n).toBe("kein Tanz");
    for (const n of ["Moonwalk", "Swing Dancing", "Female Dance Pose", "Dancing Running Man", "Clapping", "Waving Gesture"])
      expect(skipReason(n), n).toBeUndefined();
  });

  it("Katalog im Repo: automatische Einträge folgen den Regeln, gesicherte Tänze haben eine Datei", async () => {
    const { default: catalog } = await import("@/lib/dance/mixamo-clips.json");
    const { skipReason } = await import("@/scripts/mixamo/auto");
    const { existsSync } = await import("node:fs");
    type E = {
      id: string;
      search: string;
      auto?: boolean;
      skip?: boolean;
      duplicateOf?: string;
      preserved?: boolean;
      file?: string;
    };
    for (const e of catalog.clips as E[]) {
      if (e.auto && !e.duplicateOf) expect(!!e.skip, `${e.id} (${e.search})`).toBe(!!skipReason(e.search));
      if (e.preserved) expect(existsSync(join(process.cwd(), "public/animations", `${e.id}.json`)), e.id).toBe(true);
      if (e.file) expect(existsSync(join(process.cwd(), "public/animations", `${e.id}.json`)), e.id).toBe(true);
    }
  });
});
