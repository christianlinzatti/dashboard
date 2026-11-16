import { AnimationMixer, LoopOnce, Object3D, Quaternion, Vector3, type AnimationClip } from "three";

/**
 * Retargeting von Mixamo-Animationen auf das gemeinsame Avatar-Skelett.
 *
 * Die Avatare haben Mixamo-Knochennamen (ohne „mixamorig:“), aber eine eigene Grundpose und eigene
 * lokale Achsen. Deshalb werden nicht lokale Rotationen kopiert, sondern Welt-Rotationen übertragen:
 *
 *   W_ziel(t) = W_quelle(t) · R_quelle⁻¹ · C · R_ziel
 *
 * R = Welt-Rotation in der Grundpose, C = Drehung, die die Knochenrichtung der Ziel-Grundpose auf die
 * der Quelle legt (T-Pose ↔ A-Pose). So zeigt jeder Knochen zu jedem Zeitpunkt in dieselbe Richtung
 * wie in der Mixamo-Animation. Läuft ohne DOM (Node-Skript) und im Test.
 */

export type RestBone = {
  name: string;
  parent: string | null;
  position: [number, number, number];
  quaternion: [number, number, number, number];
};

/** Mixamo-Knochen → Avatar-Knochen. Spine2 (oberer Rücken) steuert die Brust, Spine1 entfällt. */
export const BONE_MAP: Record<string, string> = (() => {
  const m: Record<string, string> = { Hips: "Hips", Spine: "Spine", Spine2: "Chest", Neck: "Neck", Head: "Head" };
  for (const side of ["Left", "Right"]) {
    // Finger bleiben in Grundpose: auf dem 10-Zoll-Display unsichtbar, halbieren aber die Clip-Größe
    for (const b of ["Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot"]) m[side + b] = side + b;
  }
  return m;
})();

/** „mixamorig:Hips“, „mixamorig1:Hips“, „mixamorigHips“ (three.js säubert den Doppelpunkt) → „Hips“ */
export function stripPrefix(name: string): string {
  return name.replace(/^mixamorig\d*:?/, "");
}

/**
 * Skelette im Unreal-Stil (Mesh2Motion, Quaternius, UE-Mannequin) → Mixamo-Namen.
 * Mesh2Motion: root › pelvis › spine_01–03 › neck_01 › head, clavicle/upperarm/lowerarm/hand_l|r, thigh/calf/foot_l|r
 */
const UNREAL: Record<string, string> = (() => {
  const m: Record<string, string> = {
    pelvis: "Hips",
    spine_01: "Spine",
    spine_02: "Spine1",
    spine_03: "Spine2",
    neck_01: "Neck",
    head: "Head",
  };
  for (const [s, side] of [
    ["l", "Left"],
    ["r", "Right"],
  ] as const) {
    m[`clavicle_${s}`] = `${side}Shoulder`;
    m[`upperarm_${s}`] = `${side}Arm`;
    m[`lowerarm_${s}`] = `${side}ForeArm`;
    m[`hand_${s}`] = `${side}Hand`;
    m[`middle_01_${s}`] = `${side}HandMiddle1`;
    m[`thigh_${s}`] = `${side}UpLeg`;
    m[`calf_${s}`] = `${side}Leg`;
    m[`foot_${s}`] = `${side}Foot`;
  }
  return m;
})();

/** Knochenname der Quelle (Mixamo oder Unreal-Stil) → Mixamo-Name ohne Präfix */
export function sourceBoneName(name: string): string {
  return UNREAL[name.toLowerCase()] ?? stripPrefix(name);
}

/** Kind, an dem die Richtung eines Knochens gemessen wird (Ziel-Skelett); ohne Eintrag: Richtung des Elternknochens. */
const AIM: Record<string, string> = {
  Hips: "Spine",
  Spine: "Chest",
  Chest: "Neck",
  Neck: "Head",
  LeftShoulder: "LeftArm",
  LeftArm: "LeftForeArm",
  LeftForeArm: "LeftHand",
  LeftHand: "LeftMiddle1",
  RightShoulder: "RightArm",
  RightArm: "RightForeArm",
  RightForeArm: "RightHand",
  RightHand: "RightMiddle1",
  LeftUpLeg: "LeftLeg",
  LeftLeg: "LeftFoot",
  RightUpLeg: "RightLeg",
  RightLeg: "RightFoot",
};
/** Zielknochen, die nur als Richtungsmarke dienen (nicht animiert) → Mixamo-Name */
const AIM_ONLY: Record<string, string> = { LeftMiddle1: "LeftHandMiddle1", RightMiddle1: "RightHandMiddle1" };

/** Ziel-Skelett als Object3D-Hierarchie (Reihenfolge: Eltern vor Kindern). */
export function buildRig(rest: RestBone[]) {
  const root = new Object3D();
  const byName = new Map<string, Object3D>();
  const pending = [...rest];
  const order: Object3D[] = [];
  while (pending.length) {
    const i = pending.findIndex((b) => b.parent === null || byName.has(b.parent));
    if (i < 0) throw new Error(`Skelett unvollständig: ${pending.map((b) => b.name).join(", ")}`);
    const b = pending.splice(i, 1)[0]!;
    const o = new Object3D();
    o.name = b.name;
    o.position.fromArray(b.position);
    o.quaternion.fromArray(b.quaternion);
    (b.parent ? byName.get(b.parent)! : root).add(o);
    byName.set(b.name, o);
    order.push(o);
  }
  root.updateMatrixWorld(true);
  return { root, byName, order };
}

const worldQ = (o: Object3D) => o.getWorldQuaternion(new Quaternion());
const worldP = (o: Object3D) => o.getWorldPosition(new Vector3());

export type Sampled = {
  fps: number;
  frames: number;
  /** Knochenname → Quaternionen je Frame (x, y, z, w hintereinander) */
  rotations: Map<string, Float32Array>;
  /** Hüftposition (lokal) je Frame */
  hips: Float32Array;
};

/**
 * Tastet die Quell-Animation ab und überträgt sie Frame für Frame aufs Ziel-Skelett.
 * `source` enthält die Knochen (Mixamo-FBX oder Mesh2Motion-GLB), `clip` deren Animation.
 */
export function retargetSamples(opts: {
  source: Object3D;
  clip: AnimationClip;
  target: RestBone[];
  fps?: number;
  /** Abtastbereich in Sekunden der Quelle */
  from?: number;
  to?: number;
  /** horizontale Hüftbewegung stärker (1) oder schwächer dämpfen; Drift wird immer entfernt */
  sway?: number;
}): Sampled {
  const fps = opts.fps ?? 30;
  const from = opts.from ?? 0;
  const to = Math.min(opts.to ?? opts.clip.duration, opts.clip.duration);
  const frames = Math.max(2, Math.floor((to - from) * fps) + 1);

  // Quelle: Knochen nach Mixamo-Namen, Grundpose vor dem Abspielen merken
  const src = new Map<string, Object3D>();
  opts.source.traverse((o) => {
    const n = sourceBoneName(o.name);
    if ((BONE_MAP[n] || Object.values(AIM_ONLY).includes(n)) && !src.has(n)) src.set(n, o);
  });
  if (!src.has("Hips")) throw new Error("Keine Hüfte (Mixamo „Hips“ oder „pelvis“) in der Quelle gefunden");
  opts.source.updateMatrixWorld(true);
  const restQs = new Map([...src].map(([n, o]) => [n, worldQ(o)]));
  const restPs = new Map([...src].map(([n, o]) => [n, worldP(o)]));

  const rig = buildRig(opts.target);
  const restQt = new Map(rig.order.map((o) => [o.name, worldQ(o)]));
  const restLocal = new Map(rig.order.map((o) => [o.name, o.quaternion.clone()]));
  const targetToSource = new Map(Object.entries(BONE_MAP).map(([s, t]) => [t, s]));
  const mapped = rig.order.filter((o) => {
    const s = targetToSource.get(o.name);
    return s !== undefined && src.has(s);
  });

  // C je Knochen: Ziel-Richtung in der Grundpose → Quell-Richtung in der Grundpose
  const align = new Map<string, Quaternion>();
  for (const o of mapped) {
    const aim = AIM[o.name];
    const aimSrc = aim ? (targetToSource.get(aim) ?? AIM_ONLY[aim]) : undefined;
    const child = aim ? rig.byName.get(aim) : undefined;
    if (child && aimSrc && src.has(aimSrc)) {
      const dt = worldP(child).sub(worldP(o)).normalize();
      const ds = restPs
        .get(aimSrc)!
        .clone()
        .sub(restPs.get(targetToSource.get(o.name)!)!)
        .normalize();
      align.set(o.name, new Quaternion().setFromUnitVectors(dt, ds));
    } else {
      // Endknochen (Kopf, Fuß, Fingerspitze): wie der Elternknochen
      align.set(o.name, align.get(o.parent?.name ?? "")?.clone() ?? new Quaternion());
    }
  }

  // Größenverhältnis über die Hüfthöhe (Hüfte bis Fuß)
  const hipsT = rig.byName.get("Hips")!;
  const footT = rig.byName.get("LeftFoot");
  const footS = restPs.get("LeftFoot");
  const hipHeightT = footT ? worldP(hipsT).y - worldP(footT).y : worldP(hipsT).y;
  const hipHeightS = footS ? restPs.get("Hips")!.y - footS.y : restPs.get("Hips")!.y;
  const k = hipHeightS > 1e-6 ? hipHeightT / hipHeightS : 1;
  const restHipsT = worldP(hipsT);

  const mixer = new AnimationMixer(opts.source);
  // einmal abspielen und am Ende stehen bleiben (sonst springt t = Dauer zurück auf den Anfang)
  const action = mixer.clipAction(opts.clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  const rotations = new Map(mapped.map((o) => [o.name, new Float32Array(frames * 4)]));
  const hipsWorld: Vector3[] = [];
  const tmp = new Quaternion();
  for (let f = 0; f < frames; f++) {
    mixer.setTime(from + f / fps);
    opts.source.updateMatrixWorld(true);
    for (const o of rig.order) {
      const s = targetToSource.get(o.name);
      const so = s ? src.get(s) : undefined;
      if (!so) {
        o.quaternion.copy(restLocal.get(o.name)!);
      } else {
        // W_ziel = W_quelle · R_quelle⁻¹ · C · R_ziel, dann in lokale Rotation umrechnen
        const w = worldQ(so)
          .multiply(restQs.get(s!)!.clone().invert())
          .multiply(align.get(o.name)!)
          .multiply(restQt.get(o.name)!);
        const parentW = o.parent ? worldQ(o.parent) : new Quaternion();
        o.quaternion.copy(parentW.invert().multiply(w));
      }
      o.updateWorldMatrix(false, false);
      const arr = rotations.get(o.name);
      if (arr) {
        tmp.copy(o.quaternion);
        // Vorzeichen stetig halten (q und -q sind dieselbe Drehung) – sonst springt die Interpolation
        if (
          f > 0 &&
          tmp.x * arr[(f - 1) * 4]! +
            tmp.y * arr[(f - 1) * 4 + 1]! +
            tmp.z * arr[(f - 1) * 4 + 2]! +
            tmp.w * arr[(f - 1) * 4 + 3]! <
            0
        )
          tmp.set(-tmp.x, -tmp.y, -tmp.z, -tmp.w);
        arr.set([tmp.x, tmp.y, tmp.z, tmp.w], f * 4);
      }
    }
    hipsWorld.push(worldP(src.get("Hips")!).sub(restPs.get("Hips")!).multiplyScalar(k));
  }
  mixer.stopAllAction();

  // Hüfte: Wippen behalten, Wandern entfernen (Tänzer bleiben in ihrer Formation)
  const sway = opts.sway ?? 0.6;
  const first = hipsWorld[0]!;
  const last = hipsWorld.at(-1)!;
  const hips = new Float32Array(frames * 3);
  const parent = hipsT.parent!;
  rig.root.updateMatrixWorld(true);
  hipsWorld.forEach((d, f) => {
    const u = frames > 1 ? f / (frames - 1) : 0;
    const dx = (d.x - (first.x + (last.x - first.x) * u)) * sway;
    const dz = (d.z - (first.z + (last.z - first.z) * u)) * sway;
    const clampXZ = Math.min(1, 0.35 / Math.max(Math.hypot(dx, dz), 1e-9));
    const world = new Vector3(restHipsT.x + dx * clampXZ, restHipsT.y + d.y, restHipsT.z + dz * clampXZ);
    hips.set(parent.worldToLocal(world).toArray(), f * 3);
  });

  return { fps, frames, rotations, hips };
}

/**
 * Schleife ohne Sprung: die letzten `blend` Frames werden in den Anfang überblendet.
 * Ergebnis hat `frames - blend` Frames; der letzte Frame geht nahtlos in den ersten über.
 */
export function makeLoop(s: Sampled, blend: number): Sampled {
  const n = s.frames - blend;
  if (blend <= 0 || n < 2) return s;
  const q = new Quaternion();
  const a = new Quaternion();
  const rotations = new Map<string, Float32Array>();
  for (const [name, arr] of s.rotations) {
    const out = arr.slice(0, n * 4);
    for (let i = 0; i < blend; i++) {
      // Anfang = Mischung aus „Ende der Aufnahme“ und „Anfang“ → Übergang Ende→Anfang ist stetig
      q.fromArray(arr, (i + n) * 4);
      a.fromArray(arr, i * 4);
      q.slerp(a, i / blend);
      if (q.dot(a) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      out.set([q.x, q.y, q.z, q.w], i * 4);
    }
    rotations.set(name, out);
  }
  const hips = s.hips.slice(0, n * 3);
  for (let i = 0; i < blend; i++)
    for (let c = 0; c < 3; c++) {
      const u = i / blend;
      hips[i * 3 + c] = s.hips[(i + n) * 3 + c]! * (1 - u) + s.hips[i * 3 + c]! * u;
    }
  return { ...s, frames: n, rotations, hips };
}

/**
 * Tempo schätzen: Autokorrelation der Hüfthöhe (Wippen im Takt), Ergebnis in 80–160 BPM gefaltet.
 * Für Tänze ohne klares Wippen im Katalog überschreibbar.
 */
export function estimateBpm(hipsY: ArrayLike<number>, fps: number): number | null {
  const n = hipsY.length;
  if (n < fps * 2) return null;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += hipsY[i]!;
  mean /= n;
  const x = Array.from({ length: n }, (_, i) => hipsY[i]! - mean);
  const energy = x.reduce((s, v) => s + v * v, 0);
  if (energy < 1e-9) return null;
  let best = { lag: 0, r: -Infinity };
  const minLag = Math.round((fps * 60) / 200);
  const maxLag = Math.round((fps * 60) / 50);
  for (let lag = minLag; lag <= Math.min(maxLag, n - 1); lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += x[i]! * x[i + lag]!;
    const r = s / energy;
    if (r > best.r) best = { lag, r };
  }
  if (best.lag === 0 || best.r < 0.1) return null;
  let bpm = (60 * fps) / best.lag;
  while (bpm < 80) bpm *= 2;
  while (bpm > 160) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

type GltfJson = {
  nodes: Array<{ name?: string; children?: number[]; translation?: number[]; rotation?: number[] }>;
  skins?: Array<{ joints: number[] }>;
};

/** Grundpose des Skeletts aus dem glTF-JSON eines Avatars (Hüfte als Wurzel). */
export function restFromGltf(json: GltfJson): RestBone[] {
  const joints = new Set(json.skins?.[0]?.joints ?? []);
  const parentOf = new Map<number, number>();
  json.nodes.forEach((n, i) => n.children?.forEach((c) => parentOf.set(c, i)));
  const out: RestBone[] = [];
  json.nodes.forEach((n, i) => {
    if (!joints.has(i) || !n.name) return;
    const p = parentOf.get(i);
    out.push({
      name: n.name,
      parent: p !== undefined && joints.has(p) ? json.nodes[p]!.name! : null,
      position: (n.translation ?? [0, 0, 0]) as [number, number, number],
      quaternion: (n.rotation ?? [0, 0, 0, 1]) as [number, number, number, number],
    });
  });
  return out;
}
