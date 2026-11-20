// Körperteile, die mehrere Figuren teilen: Rumpf-Gewichte, Arme, Hände, Beine, Füße, Comic- und LED-Gesicht.
import { byHeight, vec } from "./geometry.mjs";

export const L = ["Left", 1];
export const R = ["Right", -1];

// ---------------------------------------------------------------- Körperteile, die mehrere Figuren teilen

/** Rumpf-Gewichte: Becken → Bauch → Brust → Hals */
export const torsoSkin = byHeight([
  [0.0, "Hips"],
  [0.16, "Spine"],
  [0.34, "Chest"],
  [0.47, "Chest"],
  [0.56, "Neck"],
]);

export function arms(b, J, mat, { upper = [0.07, 0.06], lower = [0.058, 0.05], shoulder = 0.075 } = {}) {
  for (const [side] of [L, R]) {
    const sh = J[`${side}Arm`];
    b.blob(mat, sh, [shoulder, shoulder, shoulder], () => [[`${side}Arm`, 0.7], [`${side}Shoulder`, 0.3]]);
    b.limb(mat, sh, J[`${side}ForeArm`], upper[0], upper[1], `${side}Arm`, `${side}ForeArm`);
    b.limb(mat, J[`${side}ForeArm`], J[`${side}Hand`], lower[0], lower[1], `${side}ForeArm`, `${side}Hand`);
  }
}

/** Fäustlinge/Pfoten an den Händen (Finger bewegen sich mit der Hand) */
export function hands(b, J, mat, { r = [0.055, 0.07, 0.045], drop = 0.05, rot } = {}) {
  for (const [side, s] of [L, R]) {
    const h = J[`${side}Hand`];
    b.blob(mat, vec.add(h, [0.008 * s, -drop, 0.004]), r, `${side}Hand`, { rot: rot?.(s) });
  }
}

export function legs(b, J, mat, { upper = [0.09, 0.075], lower = [0.072, 0.06] } = {}) {
  for (const [side] of [L, R]) {
    b.limb(mat, J[`${side}UpLeg`], J[`${side}Leg`], upper[0], upper[1], `${side}UpLeg`, `${side}Leg`);
    b.limb(mat, J[`${side}Leg`], J[`${side}Foot`], lower[0], lower[1], `${side}Leg`, `${side}Foot`);
  }
}

/** Schuhe/Füße: von der Ferse nach vorn bis zum Boden (y −1) */
export function feet(b, J, mat, { r = [0.075, 0.06, 0.13], forward = 0.05, exp = 0.6 } = {}) {
  for (const [side] of [L, R]) {
    const f = J[`${side}Foot`];
    b.blob(mat, [f[0], -0.94, f[2] + forward], r, `${side}Foot`, { exp: [exp, 0.8] });
  }
}

/** Comic-Augen (schwarz glänzend) mit Lichtpunkt, Brauen und gemaltes Lächeln an den Gesichtsknochen */
export function comicFace(b, F, { eye = [0.024, 0.032, 0.012], brow = true, smile = [0.045, 0.02, 0.008], pupil = "Ink" } = {}) {
  for (const [side] of [L, R]) {
    const e = F[`FaceEye${side}`];
    b.blob(pupil, e, eye, `FaceEye${side}`);
    b.blob("Eye sparkle", vec.add(e, [eye[0] * 0.35, eye[1] * 0.35, eye[2] * 0.9]), [eye[0] * 0.3, eye[0] * 0.3, eye[2] * 0.3], `FaceEye${side}`);
    if (brow) b.blob(pupil, F[`FaceBrow${side}`], [0.026, 0.006, 0.006], `FaceBrow${side}`, { rot: [0, 0, side === "Left" ? -0.15 : 0.15] });
  }
  b.arc(pupil, F.FaceSmile, smile[0], smile[1], smile[2], "FaceSmile", { z: 0 });
}

/** LED-Gesicht: 5 Balken (Stimme) und 2 Augen (Takt) an den Gesichtsknochen */
export function ledFace(b, F, { bar = [0.009, 0.03, 0.006], eye = [0.026, 0.026, 0.006] } = {}) {
  for (let i = 0; i < 5; i++) b.blob("LED display", F[`FaceLedBar${i}`], bar, `FaceLedBar${i}`, { exp: 0.3, seg: 10 });
  for (const [side] of [L, R]) b.blob("LED display", F[`FaceLedEye${side}`], eye, `FaceLedEye${side}`, { seg: 14 });
}
