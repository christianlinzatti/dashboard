// Körperteile, die mehrere Figuren teilen: Rumpf-Gewichte, Arme, Hände, Beine, Füße, Comic- und LED-Gesicht.
import { byHeight, smoothstep, vec } from "./geometry.mjs";

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

/**
 * Rock (Kegel vom Becken nach unten): folgt zur Seite hin weich den Beinen (vorne/hinten in der Mitte bleibt er am
 * Becken). `top`/`bottom` Höhe, `r0`/`r1` Radien [x, z] oben/unten, `hem` optionales Material für einen Saum.
 */
export const skirtSkin = (top, bottom) => (p) => {
  const down = smoothstep(top, bottom, p[1]);
  const side = p[0] >= 0 ? "LeftUpLeg" : "RightUpLeg";
  const w = 0.5 * down * smoothstep(0, 0.3, Math.abs(p[0]));
  return w > 0.001 ? [["Hips", 1 - w], [side, w]] : [["Hips", 1]];
};

export function skirt(b, mat, { top = 0.06, bottom = -0.54, r0 = [0.17, 0.14], r1 = [0.33, 0.26], hem, hemRadius = 0.012 } = {}) {
  const skin = skirtSkin(top - 0.04, bottom + 0.04);
  b.tube(
    mat,
    Array.from({ length: 9 }, (_, i) => [0, top + ((bottom - top) * i) / 8, 0]),
    (t) => [r0[0] + (r1[0] - r0[0]) * t, r0[1] + (r1[1] - r0[1]) * t],
    skin,
    { seg: 28, caps: false, up: [0, 0, 1] },
  );
  if (hem)
    b.tube(
      hem,
      Array.from({ length: 29 }, (_, i) => {
        const a = (2 * Math.PI * i) / 28;
        return [r1[0] * Math.sin(a), bottom, r1[1] * Math.cos(a)];
      }),
      hemRadius,
      skin,
      { seg: 6, caps: false },
    );
  return skin;
}

/** Ring um eine senkrechte Achse (Hutband, Gürtel, Halsband) */
export function ring(b, mat, center, rx, rz, radius, skin, seg = 24) {
  b.tube(
    mat,
    Array.from({ length: seg + 1 }, (_, i) => {
      const a = (2 * Math.PI * i) / seg;
      return [center[0] + rx * Math.sin(a), center[1], center[2] + rz * Math.cos(a)];
    }),
    radius,
    skin,
    { seg: 8, caps: false },
  );
}

/** Krempenhut: flache Krempe, Krone, Band (Cowboy, Sombrero, Trachtenhut) */
export function brimHat(b, mat, band, { y = 0.88, brim = [0.33, 0.29], crown = [0.15, 0.1, 0.15], tilt = 0, bandColor = band } = {}) {
  b.blob(mat, [0, y, 0], [brim[0], 0.022, brim[1]], "Head", { seg: 32, rot: [tilt, 0, 0] });
  b.blob(mat, [0, y + crown[1] * 0.8, -0.01], crown, "Head", { exp: [0.8, 0.7], seg: 24 });
  if (bandColor) ring(b, bandColor, [0, y + 0.02, -0.01], crown[0] + 0.003, crown[2] + 0.003, 0.014, "Head");
}
