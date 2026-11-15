import { AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } from "three";

/**
 * Kompaktes Clip-Format für umgewandelte Mixamo-Tänze (statt AnimationClip.toJSON, das ~5× größer ist):
 * Quaternionen und Hüftposition als Int16 (Base64), Zeiten implizit über fps.
 * Clips sind auf 120 BPM normiert: 1 Schlag = 0,5 s (wie die eingebauten Clips).
 */
export type PackedClip = {
  v: 1;
  name: string;
  fps: number;
  frames: number;
  bones: string[];
  /** bones × frames × 4, je Wert × 32767 */
  q: string;
  /** frames × 3 in Zehntelmillimetern (± 3,2 m) */
  hips: string;
};

const Q = 32767;
const P = 10_000;

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const i16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v)));

export function packClip(
  name: string,
  s: { fps: number; frames: number; rotations: Map<string, Float32Array>; hips: Float32Array },
): PackedClip {
  const bones = [...s.rotations.keys()];
  const q = new Int16Array(bones.length * s.frames * 4);
  bones.forEach((b, i) => s.rotations.get(b)!.forEach((v, j) => (q[i * s.frames * 4 + j] = i16(v * Q))));
  const hips = Int16Array.from(s.hips, (v) => i16(v * P));
  return {
    v: 1,
    name,
    fps: Math.round(s.fps * 1000) / 1000,
    frames: s.frames,
    bones,
    q: toBase64(new Uint8Array(q.buffer)),
    hips: toBase64(new Uint8Array(hips.buffer)),
  };
}

/** Packt aus und hängt einen Schlussframe = erster Frame an, damit die Schleife nahtlos ist. */
export function unpackClip(p: PackedClip): AnimationClip {
  if (p.v !== 1) throw new Error(`Unbekanntes Clip-Format v${String(p.v)}`);
  const q = new Int16Array(fromBase64(p.q).buffer);
  const hips = new Int16Array(fromBase64(p.hips).buffer);
  if (q.length !== p.bones.length * p.frames * 4 || hips.length !== p.frames * 3)
    throw new Error(`Clip ${p.name}: Daten passen nicht zur Länge`);
  const n = p.frames;
  const times = Float32Array.from({ length: n + 1 }, (_, i) => i / p.fps);
  const tracks = p.bones.map((b, i) => {
    const values = new Float32Array((n + 1) * 4);
    for (let j = 0; j < n * 4; j++) values[j] = q[i * n * 4 + j]! / Q;
    values.set(values.subarray(0, 4), n * 4);
    return new QuaternionKeyframeTrack(`${b}.quaternion`, times, values);
  });
  const hv = new Float32Array((n + 1) * 3);
  for (let j = 0; j < n * 3; j++) hv[j] = hips[j]! / P;
  hv.set(hv.subarray(0, 3), n * 3);
  tracks.push(new VectorKeyframeTrack("Hips.position", times, hv));
  return new AnimationClip(p.name, n / p.fps, tracks);
}
