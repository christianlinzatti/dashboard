// Bausteine für Chibi-Figuren: kurze Glieder, großer Kopf, große Anime-Augen mit Glanzlichtern, Wangenröte.
// Die Proportionen ändert die Pipeline am Skelett (spec.proportions), die Tänze bleiben stimmig.
import { byHeight, vec } from "./geometry.mjs";
import { arms, hands, L, legs, R } from "./parts.mjs";

/** Rumpf-Gewichte nach den (verkürzten) Gelenkhöhen */
export const torsoSkinFor = (J) =>
  byHeight([
    [J.Hips[1] + 0.03, "Hips"],
    [J.Spine[1] + 0.03, "Spine"],
    [J.Chest[1] + 0.03, "Chest"],
    [J.Neck[1] - 0.02, "Chest"],
    [J.Neck[1] + 0.06, "Neck"],
  ]);

/** Beine, Arme, Rumpf kürzer – Kopf etwa 40 % der Figur */
export const CHIBI = { legs: 0.48, arms: 0.5, torso: 0.62 };

/** Kopf: Mitte über dem Kopfknochen, Radien [x, y, z] */
export const headOf = (J, r = [0.41, 0.38, 0.355]) => ({ c: vec.add(J.Head, [0, 0.27, 0.01]), r });

/** Punkt auf der Vorderseite des Kopf-Ellipsoids bei (x, y) */
export function onFace(head, x, y, out = 0) {
  const [rx, ry, rz] = head.r;
  const dx = x / rx;
  const dy = (y - head.c[1]) / ry;
  const z = rz * Math.sqrt(Math.max(0.05, 1 - dx * dx - dy * dy));
  return [x, y, head.c[2] + z + out];
}

/** Verschiebung der Gesichtsknochen auf den großen Kopf (Augen groß und tief, Mund klein darunter) */
export function chibiShift(J, head = headOf(J)) {
  const to = (name, p) => [name, vec.sub(p, J[name])];
  const eyeY = head.c[1] - 0.06;
  return Object.fromEntries([
    to("FaceEyeLeft", onFace(head, 0.145, eyeY, -0.006)),
    to("FaceEyeRight", onFace(head, -0.145, eyeY, -0.006)),
    to("FaceBrowLeft", onFace(head, 0.14, eyeY + 0.135, -0.002)),
    to("FaceBrowRight", onFace(head, -0.14, eyeY + 0.135, -0.002)),
    to("FaceSmile", onFace(head, 0, head.c[1] - 0.2, 0)),
  ]);
}

/** Materialien, die jede Chibi-Figur braucht; `iris` je Figur */
export const chibiMaterials = (iris, skin = "#ffe2cf") => ({
  Skin: { color: skin, rough: 0.6 },
  Ink: { color: "#2a1a1e", rough: 0.35 },
  "Eye white": { color: "#ffffff", rough: 0.3 },
  Iris: { color: iris, rough: 0.25, emissive: 0.15 },
  Pupil: { color: "#1a0f14", rough: 0.2 },
  "Eye sparkle": { color: "#ffffff", emissive: 1 },
  Blush: { color: "#ff9aa8", rough: 0.8, emissive: 0.15 },
  Mouth: { color: "#b23a4e", rough: 0.6 },
});

/** Großer Kopf mit Ohren (optional), Anime-Augen, Wangenröte und Mund */
export function chibiHead(b, J, F, { head = headOf(J), ears = true, mouth = "smile", lashes = true } = {}) {
  b.blob("Skin", head.c, head.r, "Head", { seg: 32 });
  if (ears) for (const s of [1, -1]) b.blob("Skin", [head.r[0] * 0.97 * s, head.c[1] - 0.04, head.c[2] - 0.02], [0.04, 0.06, 0.035], "Head");
  for (const [side, s] of [L, R]) {
    const e = F[`FaceEye${side}`];
    const bone = `FaceEye${side}`;
    b.blob("Eye white", e, [0.07, 0.092, 0.016], bone, { seg: 20 });
    b.blob("Iris", vec.add(e, [0.004 * s, -0.008, 0.01]), [0.058, 0.077, 0.012], bone, { seg: 20 });
    b.blob("Pupil", vec.add(e, [0.004 * s, -0.014, 0.017]), [0.03, 0.04, 0.008], bone, { seg: 14 });
    b.blob("Eye sparkle", vec.add(e, [0.022 * s, 0.03, 0.025]), [0.021, 0.023, 0.006], bone, { seg: 12 });
    b.blob("Eye sparkle", vec.add(e, [-0.02 * s, -0.034, 0.023]), [0.01, 0.01, 0.004], bone, { seg: 8 });
    // Lidstrich oben (bei allen) und Wimpern-Schwung (optional)
    b.arc("Ink", vec.add(e, [0, 0.078, 0.008]), 0.072, 0.02, 0.009, bone, { upward: true });
    if (lashes) b.cone("Ink", vec.add(e, [0.066 * s, 0.075, 0.004]), vec.add(e, [0.095 * s, 0.094, -0.006]), 0.012, bone);
    // Brauen dünn und freundlich (außen leicht tiefer)
    b.arc("Ink", F[`FaceBrow${side}`], 0.03, 0.008, 0.004, `FaceBrow${side}`, { upward: true });
    b.blob("Blush", onFace(head, 0.215 * s, head.c[1] - 0.16, -0.012), [0.055, 0.028, 0.012], "Head", { rot: [0, 0.55 * s, 0] });
  }
  if (mouth === "open") b.blob("Mouth", F.FaceSmile, [0.032, 0.022, 0.01], "FaceSmile", { exp: [1, 0.7] });
  else b.arc("Ink", F.FaceSmile, 0.026, 0.012, 0.005, "FaceSmile");
  return head;
}

/** Haarkappe: hinten und oben über den Kopf, vorn ein Pony über der Stirn (lässt die Augen frei) */
export function hairCap(b, mat, head, { volume = 1.06, back = 0.05, fringe = 8, fringeLen = 0.1 } = {}) {
  const [rx, ry, rz] = head.r;
  b.blob(mat, vec.add(head.c, [0, 0.035, -back]), [rx * volume, ry * volume, rz * volume], "Head", { seg: 30 });
  // Pony: glattes Band über die Stirn, darunter kurze Spitzen (Anime-Pony)
  const bandY = head.c[1] + ry * 0.5;
  const band = Array.from({ length: 13 }, (_, i) => {
    const u = -1 + (2 * i) / 12;
    return onFace(head, u * rx * 0.86, bandY + 0.03 * (1 - u * u), 0.002);
  });
  b.tube(mat, band, [0.05, 0.02], "Head", { seg: 12 });
  for (let i = 0; i < fringe; i++) {
    const u = (i - (fringe - 1) / 2) / Math.max((fringe - 1) / 2, 1);
    const x = u * rx * 0.7;
    // abwechselnd lang und kurz, außen etwas länger
    const len = fringeLen * (i % 2 ? 0.7 : 1) * (1 + 0.25 * Math.abs(u));
    // flache Strähne, die auf der Stirn aufliegt (breit, wenig tief, zur Spitze schmal)
    const base = onFace(head, x, bandY + 0.01, 0.004);
    const mid = onFace(head, x * 1.03, bandY - 0.01 - len * 0.5, 0.006);
    const tip = onFace(head, x * 1.06, bandY - 0.02 - len, 0.004);
    b.tube(mat, [base, mid, tip], (t) => [0.05 * (1 - t) + 0.003, 0.016 * (1 - t) + 0.002], "Head", { seg: 10, caps: false });
  }
}

/** Seitliche Strähnen bis zum Kinn (Bob) oder lang */
export function sideLocks(b, mat, head, { length = 0.32, width = 0.07 } = {}) {
  for (const s of [1, -1]) {
    const top = [head.r[0] * 0.92 * s, head.c[1] + 0.05, head.c[2] + 0.06];
    b.tube(mat, [top, vec.add(top, [0.02 * s, -length * 0.5, -0.01]), vec.add(top, [0.01 * s, -length, -0.03])], (t) => width * (1 - 0.6 * t), "Head", { seg: 10 });
  }
}

/** Zöpfe/Twintails seitlich oben am Kopf, schwingen mit dem Kopf */
export function twinTails(b, mat, head, { length = 0.45, size = 0.09, tie } = {}) {
  for (const s of [1, -1]) {
    const root = [head.r[0] * 0.85 * s, head.c[1] + head.r[1] * 0.45, head.c[2] - 0.08];
    const pts = [root, vec.add(root, [0.12 * s, -0.08, -0.04]), vec.add(root, [0.16 * s, -length * 0.55, -0.06]), vec.add(root, [0.12 * s, -length, -0.04])];
    b.tube(mat, pts, (t) => size * (0.7 + 0.5 * Math.sin(t * Math.PI)) * (1 - 0.5 * t), "Head", { seg: 12 });
    if (tie) b.blob(tie, root, [0.04, 0.04, 0.04], "Head");
  }
}

/** Tierohren (Katze/Fuchs spitz, Bär/Hase rund/lang) oben am Kopf oder an der Kapuze */
export function animalEars(b, outer, inner, head, { kind = "spitz", spread = 0.62, lift = 0 } = {}) {
  for (const s of [1, -1]) {
    const base = [head.r[0] * spread * s, head.c[1] + head.r[1] * 0.8 + lift, head.c[2] - 0.02];
    if (kind === "rund") {
      b.blob(outer, vec.add(base, [0.04 * s, 0.05, 0]), [0.085, 0.085, 0.05], "Head");
      if (inner) b.blob(inner, vec.add(base, [0.04 * s, 0.05, 0.03]), [0.05, 0.05, 0.03], "Head");
    } else if (kind === "lang") {
      const tip = vec.add(base, [0.05 * s, 0.34, -0.04]);
      b.tube(outer, [base, vec.lerp(base, tip, 0.5), tip], (t) => [0.06 * (1 - 0.3 * t), 0.03], "Head", { seg: 12 });
      if (inner) b.tube(inner, [vec.add(base, [0, 0.03, 0.022]), vec.add(tip, [0, -0.04, 0.02])], [0.035, 0.012], "Head", { seg: 10 });
    } else {
      const tip = vec.add(base, [0.08 * s, 0.2, -0.02]);
      b.cone(outer, base, tip, 0.09, "Head");
      if (inner) b.cone(inner, vec.add(base, [0, 0.02, 0.03]), vec.add(tip, [-0.01 * s, -0.04, 0.025]), 0.055, "Head");
    }
  }
}

/** Kapuze hinter dem Kopf (Hoodie-Figuren) – rahmt das Gesicht, lässt es frei */
export function hood(b, mat, head, { size = 1.14 } = {}) {
  const [rx, ry, rz] = head.r;
  b.blob(mat, vec.add(head.c, [0, 0.03, -0.07]), [rx * size, ry * size, rz * size], "Head", { seg: 30 });
  b.tube(
    mat,
    Array.from({ length: 25 }, (_, i) => {
      const a = (2 * Math.PI * i) / 24;
      return onFace(head, rx * 0.93 * Math.sin(a), head.c[1] + ry * 0.9 * Math.cos(a), -0.04);
    }),
    0.035,
    "Head",
    { seg: 8, caps: false },
  );
}

/** Kleiner Körper: Rumpf, kurze Arme mit Händchen, kurze Beine */
export function chibiBody(b, J, { top, sleeves = top, legsMat = "Skin", skin = "Skin", chest = [0.17, 0.2, 0.14] } = {}) {
  const mid = vec.lerp(J.Hips, J.Neck, 0.5);
  b.blob(top, mid, chest, torsoSkinFor(J), { seg: 26 });
  b.limb(skin, J.Neck, vec.add(J.Neck, [0, 0.08, 0]), 0.05, 0.05, "Neck", "Head", { caps: false });
  arms(b, J, sleeves, { upper: [0.052, 0.048], lower: [0.048, 0.045], shoulder: 0.06 });
  hands(b, J, skin, { r: [0.038, 0.04, 0.034], drop: 0.025 });
  legs(b, J, legsMat, { upper: [0.068, 0.06], lower: [0.058, 0.054] });
}

/** Klobige Schuhe (Sneaker, Stiefel) mit heller Sohle */
export function chunkyShoes(b, J, mat, sole, { r = [0.075, 0.06, 0.115], forward = 0.035 } = {}) {
  for (const [side] of [L, R]) {
    const f = J[`${side}Foot`];
    b.blob(mat, [f[0], -0.945, f[2] + forward], r, `${side}Foot`, { exp: [0.6, 0.7], seg: 18 });
    if (sole) b.blob(sole, [f[0], -0.99, f[2] + forward], [r[0] * 1.03, 0.016, r[2] * 1.03], `${side}Foot`, { exp: [0.6, 0.4], seg: 18 });
  }
}

/** Socken/Stiefelschaft am Unterschenkel (von unten bis `height` Anteil Richtung Knie) */
export function socks(b, J, mat, { height = 0.6, radius = 0.062, stripes } = {}) {
  for (const [side] of [L, R]) {
    const knee = J[`${side}Leg`];
    const foot = J[`${side}Foot`];
    b.limb(mat, vec.lerp(foot, knee, height), foot, radius, radius, `${side}Leg`, null, { caps: false, steps: 2 });
    if (stripes)
      for (let k = 1; k <= 3; k++)
        b.blob(stripes, vec.lerp(foot, knee, (height * k) / 4), [radius + 0.004, 0.012, radius + 0.004], `${side}Leg`, { seg: 16 });
  }
}
