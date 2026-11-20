// Fünfte Runde: Tiere und Fantasy – Dino, Einhorn, Fuchs, Hai-Kostüm, Zauberer, Pirat, Ninja
import { vec } from "../geometry.mjs";
import { arms, comicFace, feet, hands, L, legs, R, ring, skirt, torsoSkin } from "../parts.mjs";

const comicMaterials = {
  Ink: { color: "#120c0a", rough: 0.25 },
  "Eye sparkle": { color: "#ffffff", emissive: 0.8 },
};

/** Gesicht ein Stück nach vorn auf den Menschenkopf (Radius ~0,165) */
const humanFace = {
  FaceEyeLeft: [0, -0.01, 0.035],
  FaceEyeRight: [0, -0.01, 0.035],
  FaceBrowLeft: [0, -0.012, 0.035],
  FaceBrowRight: [0, -0.012, 0.035],
  FaceSmile: [0, -0.015, 0.04],
};

/** Schwanz: Röhre vom Becken nach hinten, am Becken gebunden (wackelt mit der Hüfte) */
function tail(b, mat, points, radius, tip) {
  b.tube(mat, points, radius, "Hips", { seg: 14 });
  if (tip) b.blob(tip.mat, points.at(-1), tip.r, "Hips");
}

const figuren = {
  "dino-rex": {
    base: "rio-carnival",
    title: "Dino Rex",
    materials: {
      ...comicMaterials,
      "Scale stage suit": { color: "#3fae55", rough: 0.55 },
      "Belly armor": { color: "#d9e8a6", rough: 0.7 },
      "Spike luminous trim": { color: "#ffb21c", emissive: 0.3 },
      Teeth: { color: "#fffdf2", rough: 0.4 },
      Mouth: { color: "#6d1f2a", rough: 0.6 },
      Claw: { color: "#f3ead2", rough: 0.4 },
      "Eye white": { color: "#ffffff", rough: 0.4 },
    },
    shift: {
      FaceEyeLeft: [0.04, 0.07, 0.07],
      FaceEyeRight: [-0.04, 0.07, 0.07],
      FaceBrowLeft: [0.04, 0.085, 0.065],
      FaceBrowRight: [-0.04, 0.085, 0.065],
      FaceSmile: [0, -0.06, 0.15],
    },
    body(b, J, F) {
      // großer Kopf mit langer Schnauze, Zahnreihe, Augen oben seitlich
      b.blob("Scale stage suit", [0, 0.78, 0.0], [0.19, 0.18, 0.19], "Head", { seg: 26 });
      b.blob("Scale stage suit", [0, 0.71, 0.15], [0.14, 0.1, 0.17], "Head", { exp: [0.7, 0.8], seg: 24 });
      b.blob("Mouth", [0, 0.655, 0.2], [0.12, 0.015, 0.12], "Head", { exp: 0.6 });
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + (1.8 * i) / 6;
        b.cone("Teeth", [0.115 * Math.sin(a), 0.668, 0.2 + 0.12 * Math.cos(a)], [0.115 * Math.sin(a), 0.645, 0.2 + 0.12 * Math.cos(a)], 0.012, "Head");
      }
      for (const [side] of [L, R]) {
        b.blob("Scale stage suit", vec.add(F[`FaceEye${side}`], [0, -0.008, -0.02]), [0.048, 0.045, 0.04], "Head");
        b.blob("Eye white", F[`FaceEye${side}`], [0.032, 0.036, 0.02], `FaceEye${side}`);
      }
      comicFace(b, F, { eye: [0.018, 0.024, 0.012], brow: false, smile: [0.06, 0.008, 0.006] });
      // dicker Körper, heller Bauch, Stachelreihe, langer Schwanz
      b.blob("Scale stage suit", [0, 0.15, -0.02], [0.25, 0.36, 0.22], torsoSkin, { seg: 28 });
      b.blob("Belly armor", [0, 0.1, 0.1], [0.17, 0.28, 0.13], torsoSkin);
      for (let k = 0; k < 6; k++) {
        const y = 0.88 - k * 0.12;
        const z = k < 2 ? -0.13 : -0.2;
        b.cone("Spike luminous trim", [0, y, z], [0, y + 0.02, z - 0.08], 0.035, k < 2 ? "Head" : torsoSkin);
      }
      tail(b, "Scale stage suit", [[0, -0.05, -0.15], [0, -0.25, -0.35], [0, -0.45, -0.55], [0, -0.55, -0.72]], (t) => 0.14 * (1 - t) + 0.02);
      // winzige Ärmchen mit Krallen
      for (const [side, s] of [L, R]) {
        const a = J[`${side}Arm`];
        const mid = vec.lerp(a, J[`${side}ForeArm`], 0.45);
        b.blob("Scale stage suit", a, [0.06, 0.06, 0.06], `${side}Arm`);
        b.limb("Scale stage suit", a, mid, 0.045, 0.04, `${side}Arm`, null);
        b.blob("Scale stage suit", vec.add(mid, [0.01 * s, -0.03, 0.03]), [0.035, 0.04, 0.035], `${side}ForeArm`);
        for (const dx of [-0.015, 0.015]) b.cone("Claw", vec.add(mid, [dx, -0.06, 0.05]), vec.add(mid, [dx, -0.09, 0.07]), 0.01, `${side}ForeArm`);
      }
      legs(b, J, "Scale stage suit", { upper: [0.12, 0.1], lower: [0.085, 0.075] });
      feet(b, J, "Scale stage suit", { r: [0.09, 0.06, 0.15], forward: 0.05, exp: 0.8 });
      for (const [side] of [L, R])
        for (const dx of [-0.04, 0, 0.04]) {
          const f = J[`${side}Foot`];
          b.cone("Claw", [f[0] + dx, -0.96, f[2] + 0.17], [f[0] + dx, -0.97, f[2] + 0.23], 0.016, `${side}Foot`);
        }
    },
  },

  einhorn: {
    base: "aurora-synth",
    title: "Einhorn",
    materials: {
      ...comicMaterials,
      "Unicorn stage suit": { color: "#fbf7ff", rough: 0.6 },
      "Hoof armor": { color: "#f2c94c", metal: 0.85, rough: 0.25 },
      "Horn luminous trim": { color: "#ffd84a", emissive: 0.7 },
      Muzzle: { color: "#ffd6e8", rough: 0.6 },
      Mane1: { color: "#ff4f8b", rough: 0.6 },
      Mane2: { color: "#ffb13b", rough: 0.6 },
      Mane3: { color: "#57d38c", rough: 0.6 },
      Mane4: { color: "#4f8bff", rough: 0.6 },
      Mane5: { color: "#a35cff", rough: 0.6 },
    },
    shift: {
      FaceEyeLeft: [0.015, 0.005, 0.045],
      FaceEyeRight: [-0.015, 0.005, 0.045],
      FaceBrowLeft: [0.015, 0.01, 0.04],
      FaceBrowRight: [-0.015, 0.01, 0.04],
      FaceSmile: [0, -0.05, 0.12],
    },
    body(b, J, F) {
      // Pferdekopf mit Schnauze, Ohren, gedrehtes leuchtendes Horn, Regenbogenmähne
      b.blob("Unicorn stage suit", [0, 0.77, 0], [0.165, 0.17, 0.16], "Head", { seg: 26 });
      b.blob("Muzzle", [0, 0.66, 0.13], [0.11, 0.085, 0.11], "Head", { seg: 22 });
      for (const s of [1, -1]) {
        b.blob("Ink", [0.04 * s, 0.665, 0.235], [0.012, 0.008, 0.006], "Head");
        b.cone("Unicorn stage suit", [0.1 * s, 0.9, -0.03], [0.13 * s, 1.0, -0.05], 0.04, "Head");
      }
      const horn = Array.from({ length: 13 }, (_, i) => {
        const t = i / 12;
        return [0.008 * Math.sin(t * 20), 0.92 + 0.22 * t, 0.07 + 0.06 * t + 0.008 * Math.cos(t * 20)];
      });
      b.tube("Horn luminous trim", horn, (t) => 0.035 * (1 - t) + 0.003, "Head", { seg: 10 });
      comicFace(b, F, { eye: [0.026, 0.032, 0.012], smile: [0.03, 0.01, 0.006] });
      ["Mane1", "Mane2", "Mane3", "Mane4", "Mane5"].forEach((m, k) => {
        b.blob(m, [0, 0.95 - k * 0.075, -0.12 - k * 0.025], [0.05, 0.06, 0.07], k < 3 ? "Head" : "Neck", { seg: 14 });
      });
      // Körper, goldene Hufe, Regenbogenschweif
      b.blob("Unicorn stage suit", [0, 0.2, 0], [0.21, 0.3, 0.17], torsoSkin, { seg: 26 });
      arms(b, J, "Unicorn stage suit", { upper: [0.055, 0.05], lower: [0.048, 0.044], shoulder: 0.064 });
      hands(b, J, "Hoof armor", { r: [0.045, 0.045, 0.045], drop: 0.035 });
      legs(b, J, "Unicorn stage suit", { upper: [0.075, 0.062], lower: [0.058, 0.05] });
      feet(b, J, "Hoof armor", { r: [0.065, 0.055, 0.085], forward: 0.015, exp: 0.6 });
      ["Mane1", "Mane2", "Mane3", "Mane4", "Mane5"].forEach((m, k) => {
        const x = (k - 2) * 0.025;
        tail(b, m, [[x, -0.02, -0.15], [x * 1.5, -0.15, -0.27], [x * 2, -0.38, -0.3]], (t) => 0.03 - 0.015 * t);
      });
    },
  },

  "fuchs-fritzi": {
    base: "aurora-synth",
    title: "Fuchs Fritzi",
    materials: {
      ...comicMaterials,
      "Fox stage suit": { color: "#e8702a", rough: 0.8 },
      "White armor": { color: "#fbf6ee", rough: 0.85 },
      Dark: { color: "#2a1d18", rough: 0.7 },
      "Scarf luminous trim": { color: "#3fa7ff", emissive: 0.25 },
    },
    shift: {
      FaceEyeLeft: [0.015, 0.01, 0.045],
      FaceEyeRight: [-0.015, 0.01, 0.045],
      FaceBrowLeft: [0.015, 0.012, 0.04],
      FaceBrowRight: [-0.015, 0.012, 0.04],
      FaceSmile: [0, -0.045, 0.1],
    },
    body(b, J, F) {
      // Fuchskopf mit spitzer Schnauze, weißen Wangen, großen spitzen Ohren mit dunklen Spitzen
      b.blob("Fox stage suit", [0, 0.76, 0], [0.18, 0.16, 0.16], "Head", { seg: 26 });
      for (const s of [1, -1]) b.blob("White armor", [0.08 * s, 0.68, 0.11], [0.08, 0.06, 0.06], "Head", { seg: 18 });
      b.cone("Fox stage suit", [0, 0.7, 0.12], [0, 0.67, 0.28], 0.075, "Head");
      b.blob("Dark", [0, 0.675, 0.28], [0.022, 0.018, 0.018], "Head");
      for (const s of [1, -1]) {
        b.cone("Fox stage suit", [0.11 * s, 0.86, -0.02], [0.17 * s, 1.04, -0.04], 0.07, "Head");
        b.cone("Dark", [0.155 * s, 0.98, -0.035], [0.17 * s, 1.04, -0.04], 0.026, "Head");
        b.cone("White armor", [0.11 * s, 0.87, 0.012], [0.155 * s, 0.99, -0.01], 0.04, "Head");
      }
      comicFace(b, F, { eye: [0.024, 0.03, 0.012], smile: [0.026, 0.008, 0.005] });
      // Halstuch, weiße Brust, buschiger Schwanz mit weißer Spitze, dunkle „Socken“
      ring(b, "Scarf luminous trim", [0, 0.5, 0], 0.12, 0.11, 0.03, "Neck");
      b.blob("Fox stage suit", [0, 0.2, 0], [0.2, 0.29, 0.16], torsoSkin, { seg: 26 });
      b.blob("White armor", [0, 0.28, 0.1], [0.11, 0.17, 0.08], "Chest");
      tail(b, "Fox stage suit", [[0, -0.05, -0.15], [0.05, -0.2, -0.32], [0.12, -0.32, -0.42]], (t) => 0.06 + 0.07 * Math.sin(t * Math.PI));
      b.blob("White armor", [0.14, -0.36, -0.45], [0.06, 0.06, 0.06], "Hips");
      arms(b, J, "Fox stage suit", { upper: [0.052, 0.046], lower: [0.046, 0.042], shoulder: 0.062 });
      for (const [side] of [L, R]) b.limb("Dark", vec.lerp(J[`${side}ForeArm`], J[`${side}Hand`], 0.4), J[`${side}Hand`], 0.045, 0.043, `${side}ForeArm`, null, { caps: false });
      hands(b, J, "Dark", { r: [0.042, 0.048, 0.04], drop: 0.035 });
      legs(b, J, "Fox stage suit", { upper: [0.072, 0.06], lower: [0.056, 0.05] });
      for (const [side] of [L, R]) b.limb("Dark", vec.lerp(J[`${side}Leg`], J[`${side}Foot`], 0.45), J[`${side}Foot`], 0.054, 0.05, `${side}Leg`, `${side}Foot`, { caps: false });
      feet(b, J, "Dark", { r: [0.065, 0.05, 0.11], forward: 0.035, exp: 0.9 });
    },
  },

  "hai-kostuem": {
    base: "rio-carnival",
    title: "Hai Kostuem",
    materials: {
      ...comicMaterials,
      Skin: { color: "#efbf9b", rough: 0.6 },
      "Shark stage suit": { color: "#5f7d9b", rough: 0.55 },
      "Belly armor": { color: "#f2f5f8", rough: 0.7 },
      Teeth: { color: "#ffffff", rough: 0.3 },
      "Gill luminous trim": { color: "#3df5ff", emissive: 0.5 },
      Mouth: { color: "#a33a4a", rough: 0.6, double: true },
    },
    shift: humanFace,
    body(b, J, F) {
      // Gesicht schaut aus dem offenen Haimaul: Kapuze als Haikopf mit Zähnen ringsum, Rückenflosse
      b.blob("Skin", [0, 0.73, 0], [0.15, 0.17, 0.15], "Head", { seg: 26 });
      comicFace(b, F, { eye: [0.02, 0.025, 0.01], smile: [0.035, 0.012, 0.007] });
      b.blob("Shark stage suit", [0, 0.8, -0.11], [0.23, 0.26, 0.22], "Head", { seg: 28 });
      b.blob("Shark stage suit", [0, 0.97, 0.06], [0.14, 0.09, 0.16], "Head", { seg: 22, rot: [-0.3, 0, 0] });
      b.tube(
        "Mouth",
        Array.from({ length: 29 }, (_, i) => {
          const a = (2 * Math.PI * i) / 28;
          return [0.168 * Math.sin(a), 0.73 + 0.195 * Math.cos(a), 0.125];
        }),
        0.022,
        "Head",
        { seg: 8, caps: false },
      );
      for (let i = 0; i < 12; i++) {
        const a = (2 * Math.PI * i) / 12;
        const base = [0.165 * Math.sin(a), 0.73 + 0.19 * Math.cos(a), 0.14];
        const tip = vec.add(base, [-0.035 * Math.sin(a), -0.04 * Math.cos(a), 0.02]);
        b.cone("Teeth", base, tip, 0.017, "Head");
      }
      for (const s of [1, -1]) b.blob("Ink", [0.16 * s, 0.92, 0.02], [0.022, 0.026, 0.02], "Head");
      b.cone("Shark stage suit", [0, 1.0, -0.12], [0, 1.22, -0.26], 0.09, "Head");
      // Hai-Anzug mit weißem Bauch, Kiemen, Flossen an den Armen, Schwanzflosse
      b.blob("Shark stage suit", [0, 0.2, 0], [0.23, 0.3, 0.17], torsoSkin, { seg: 26 });
      b.blob("Belly armor", [0, 0.17, 0.1], [0.15, 0.24, 0.09], torsoSkin);
      for (const s of [1, -1]) for (let k = 0; k < 3; k++) b.blob("Gill luminous trim", [0.2 * s, 0.38 - k * 0.04, 0.06], [0.006, 0.025, 0.015], "Chest");
      for (const [side, s] of [L, R]) b.cone("Shark stage suit", vec.lerp(J[`${side}Arm`], J[`${side}ForeArm`], 0.5), vec.add(vec.lerp(J[`${side}Arm`], J[`${side}ForeArm`], 0.5), [0.02 * s, 0.03, -0.12]), 0.05, `${side}Arm`);
      tail(b, "Shark stage suit", [[0, -0.05, -0.15], [0, -0.18, -0.3], [0, -0.28, -0.42]], (t) => 0.09 * (1 - t) + 0.03);
      b.cone("Shark stage suit", [0, -0.28, -0.42], [0, -0.05, -0.55], 0.05, "Hips");
      b.cone("Shark stage suit", [0, -0.28, -0.42], [0, -0.45, -0.55], 0.04, "Hips");
      arms(b, J, "Shark stage suit", { upper: [0.06, 0.054], lower: [0.052, 0.048], shoulder: 0.07 });
      hands(b, J, "Belly armor", { r: [0.045, 0.055, 0.04], drop: 0.045 });
      legs(b, J, "Shark stage suit", { upper: [0.078, 0.066], lower: [0.062, 0.056] });
      feet(b, J, "Belly armor", { r: [0.075, 0.055, 0.13], forward: 0.045, exp: 0.8 });
    },
  },

  "zauberer-zarko": {
    base: "aurora-synth",
    title: "Zauberer Zarko",
    materials: {
      ...comicMaterials,
      Skin: { color: "#efc3a2", rough: 0.6 },
      Beard: { color: "#eef0f4", rough: 0.95 },
      "Robe stage suit": { color: "#2b2f8f", rough: 0.6, double: true },
      "Star luminous trim": { color: "#ffe066", emissive: 0.9 },
      "Sash armor": { color: "#8b5cf6", rough: 0.5 },
    },
    shift: { ...humanFace, FaceSmile: [0, -0.035, 0.07] },
    body(b, J, F) {
      b.blob("Skin", [0, 0.73, 0], [0.16, 0.185, 0.16], "Head", { seg: 26 });
      comicFace(b, F, { eye: [0.02, 0.024, 0.01], smile: [0.028, 0.01, 0.007] });
      b.cone("Beard", [0, 0.64, 0.12], [0, 0.33, 0.17], 0.13, "Head");
      for (const s of [1, -1]) b.blob("Beard", [0.04 * s, 0.67, 0.162], [0.05, 0.018, 0.022], "Head", { rot: [0, 0, -0.3 * s] });
      for (const s of [1, -1]) b.blob("Beard", [0.05 * s, 0.81, 0.15], [0.035, 0.012, 0.02], "Head");
      // Spitzhut mit Sternen und breiter Krempe (Spitze knickt nach hinten)
      b.blob("Robe stage suit", [0, 0.87, 0], [0.27, 0.02, 0.26], "Head", { seg: 30 });
      b.tube("Robe stage suit", [[0, 0.87, 0], [0, 1.0, -0.01], [0, 1.12, -0.04], [-0.04, 1.22, -0.12]], (t) => 0.17 * (1 - t) + 0.008, "Head", { seg: 20 });
      for (const [x, y, z] of [[0.08, 0.95, 0.12], [-0.06, 1.04, 0.09], [0.03, 1.12, 0.06]]) b.blob("Star luminous trim", [x, y, z], [0.018, 0.018, 0.01], "Head");
      // langes Gewand mit weiten Ärmeln, Schärpe, Sterne
      b.blob("Robe stage suit", [0, 0.22, 0], [0.21, 0.28, 0.16], torsoSkin, { seg: 26 });
      const robe = skirt(b, "Robe stage suit", { top: 0.06, bottom: -0.95, r0: [0.2, 0.16], r1: [0.36, 0.3], hem: "Star luminous trim", hemRadius: 0.014 });
      ring(b, "Sash armor", [0, 0.05, 0], 0.205, 0.165, 0.025, "Hips");
      for (let k = 0; k < 9; k++) {
        const a = -1.1 + (2.2 * k) / 8;
        const y = -0.2 - (k % 3) * 0.22;
        const t = (0.06 - y) / 1.01;
        b.blob("Star luminous trim", [(0.2 + 0.16 * t) * Math.sin(a) * 1.01, y, (0.16 + 0.14 * t) * Math.cos(a) * 1.02], [0.016, 0.016, 0.008], robe);
      }
      arms(b, J, "Robe stage suit", { upper: [0.058, 0.055], lower: [0.055, 0.05], shoulder: 0.068 });
      for (const [side] of [L, R]) b.cone("Robe stage suit", J[`${side}Hand`], vec.lerp(J[`${side}Hand`], J[`${side}ForeArm`], 0.6), 0.1, `${side}ForeArm`);
      hands(b, J, "Skin", { r: [0.036, 0.05, 0.032], drop: 0.045 });
      legs(b, J, "Robe stage suit", { upper: [0.06, 0.055], lower: [0.05, 0.045] });
      feet(b, J, "Sash armor", { r: [0.06, 0.04, 0.12], forward: 0.05, exp: 0.8 });
    },
  },

  "pirat-paula": {
    base: "luna-flow",
    title: "Pirat Paula",
    materials: {
      ...comicMaterials,
      Skin: { color: "#d9a07a", rough: 0.6 },
      Hair: { color: "#7a2e14", rough: 0.85 },
      "Coat stage suit": { color: "#8c1d2c", rough: 0.6 },
      Hat: { color: "#1c1a1c", rough: 0.6 },
      "Gold armor": { color: "#e8c25a", metal: 0.9, rough: 0.25 },
      Shirt: { color: "#f3efe4", rough: 0.8 },
      Boots: { color: "#2a1a12", rough: 0.4 },
      "Skull luminous trim": { color: "#ffffff", emissive: 0.4 },
      Pants: { color: "#3b3328", rough: 0.8 },
    },
    shift: humanFace,
    body(b, J, F) {
      b.blob("Skin", [0, 0.73, 0], [0.16, 0.185, 0.16], "Head", { seg: 26 });
      comicFace(b, F, { eye: [0.02, 0.025, 0.01], smile: [0.035, 0.014, 0.007] });
      // Augenklappe rechts mit Band, lange Locken, Dreispitz mit Totenkopf
      b.blob("Hat", vec.add(F.FaceEyeRight, [0, 0, 0.008]), [0.034, 0.03, 0.012], "Head");
      b.tube("Hat", [[-0.16, 0.8, 0.02], vec.add(F.FaceEyeRight, [0, 0.01, 0.01]), [0.16, 0.71, 0.04]], 0.006, "Head", { seg: 6 });
      b.blob("Hair", [0, 0.8, -0.06], [0.17, 0.13, 0.14], "Head", { seg: 22 });
      for (const s of [1, -1]) b.tube("Hair", [[0.15 * s, 0.75, -0.04], [0.17 * s, 0.6, -0.05], [0.15 * s, 0.47, -0.06]], (t) => 0.045 - 0.015 * t, "Head", { seg: 10 });
      b.blob("Hat", [0, 0.88, 0], [0.24, 0.025, 0.22], "Head", { seg: 30 });
      for (let k = 0; k < 3; k++) {
        const a = (2 * Math.PI * k) / 3 + Math.PI / 3;
        b.blob("Hat", [0.21 * Math.sin(a), 0.93, 0.2 * Math.cos(a)], [0.12, 0.07, 0.03], "Head", { rot: [0, a, 0] });
      }
      b.blob("Hat", [0, 0.95, -0.01], [0.15, 0.08, 0.14], "Head", { seg: 22 });
      b.blob("Skull luminous trim", [0, 0.94, 0.15], [0.024, 0.024, 0.01], "Head");
      // langer roter Gehrock mit Goldknöpfen, Hemd, Gürtel, Pluderhose, Stulpenstiefel
      b.blob("Shirt", [0, 0.3, 0.05], [0.15, 0.17, 0.12], "Chest");
      for (const s of [1, -1]) b.blob("Coat stage suit", [0.11 * s, 0.24, 0], [0.13, 0.27, 0.165], torsoSkin, { seg: 22 });
      b.blob("Coat stage suit", [0, 0.24, -0.05], [0.22, 0.27, 0.13], torsoSkin);
      for (const s of [1, -1]) for (let k = 0; k < 3; k++) b.blob("Gold armor", [0.12 * s, 0.32 - k * 0.08, 0.16], [0.013, 0.013, 0.008], "Chest");
      skirt(b, "Coat stage suit", { top: 0.0, bottom: -0.42, r0: [0.21, 0.17], r1: [0.27, 0.22] });
      ring(b, "Hat", [0, 0.02, 0], 0.215, 0.175, 0.025, "Hips");
      b.blob("Gold armor", [0, 0.02, 0.18], [0.04, 0.03, 0.01], "Hips", { exp: 0.4 });
      arms(b, J, "Coat stage suit", { upper: [0.06, 0.054], lower: [0.052, 0.05], shoulder: 0.07 });
      for (const [side] of [L, R]) b.cone("Shirt", vec.lerp(J[`${side}ForeArm`], J[`${side}Hand`], 0.85), vec.lerp(J[`${side}ForeArm`], J[`${side}Hand`], 1.05), 0.06, `${side}ForeArm`);
      hands(b, J, "Skin", { r: [0.04, 0.055, 0.035], drop: 0.045 });
      legs(b, J, "Pants", { upper: [0.08, 0.07], lower: [0.06, 0.055] });
      for (const [side] of [L, R]) {
        b.limb("Boots", vec.lerp(J[`${side}Leg`], J[`${side}Foot`], 0.0), J[`${side}Foot`], 0.075, 0.065, `${side}Leg`, `${side}Foot`, { caps: false });
        b.blob("Boots", J[`${side}Leg`], [0.085, 0.04, 0.085], `${side}Leg`);
      }
      feet(b, J, "Boots", { r: [0.072, 0.06, 0.13], forward: 0.045, exp: 0.6 });
    },
  },

  "ninja-nori": {
    base: "rio-carnival",
    title: "Ninja Nori",
    materials: {
      ...comicMaterials,
      Skin: { color: "#e9b994", rough: 0.6 },
      "Ninja stage suit": { color: "#17171d", rough: 0.75 },
      "Band luminous trim": { color: "#e8223f", emissive: 0.4 },
      Wrap: { color: "#3a3a44", rough: 0.85 },
      Blade: { color: "#d7dde6", metal: 0.9, rough: 0.15 },
      Handle: { color: "#5a1e1e", rough: 0.6 },
      Gold: { color: "#e8c25a", metal: 0.9, rough: 0.25 },
    },
    shift: humanFace,
    body(b, J, F) {
      // Maske mit Augenschlitz (Haut sichtbar), Stirnband mit wehenden Enden
      b.blob("Ninja stage suit", [0, 0.73, 0], [0.165, 0.19, 0.165], "Head", { seg: 26 });
      b.blob("Skin", [0, 0.745, 0.04], [0.135, 0.045, 0.14], "Head", { exp: [1, 0.6], seg: 24 });
      comicFace(b, F, { eye: [0.02, 0.025, 0.01], smile: [0.001, 0.001, 0.001] });
      ring(b, "Band luminous trim", [0, 0.82, 0], 0.167, 0.167, 0.018, "Head");
      for (const dy of [0, -0.04]) b.tube("Band luminous trim", [[0, 0.82, -0.16], [0.04, 0.8 + dy, -0.28], [0.1, 0.77 + dy * 2, -0.38]], [0.022, 0.006], "Head", { seg: 8 });
      // Anzug, Gürtel, gewickelte Unterarme und Schienbeine, Schwert auf dem Rücken
      b.blob("Ninja stage suit", [0, 0.22, 0], [0.21, 0.28, 0.16], torsoSkin, { seg: 26 });
      for (const s of [1, -1]) b.tube("Ninja stage suit", [[0.12 * s, 0.45, 0.12], [0.0, 0.25, 0.168], [-0.08 * s, 0.05, 0.155]], 0.012, torsoSkin, { seg: 6 });
      ring(b, "Band luminous trim", [0, 0.03, 0], 0.205, 0.165, 0.028, "Hips");
      b.blob("Ninja stage suit", [0, -0.06, 0], [0.19, 0.1, 0.14], "Hips");
      b.tube("Blade", [[-0.16, 0.05, -0.2], [0.14, 0.52, -0.2]], [0.02, 0.006], "Chest", { seg: 8 });
      b.tube("Handle", [[0.14, 0.52, -0.2], [0.22, 0.64, -0.2]], 0.02, "Chest", { seg: 8 });
      b.blob("Gold", [0.14, 0.52, -0.2], [0.04, 0.012, 0.04], "Chest", { rot: [0, 0, -0.98] });
      arms(b, J, "Ninja stage suit", { upper: [0.056, 0.05], lower: [0.048, 0.044], shoulder: 0.064 });
      for (const [side] of [L, R]) b.limb("Wrap", vec.lerp(J[`${side}ForeArm`], J[`${side}Hand`], 0.35), J[`${side}Hand`], 0.05, 0.047, `${side}ForeArm`, null, { caps: false });
      hands(b, J, "Ninja stage suit", { r: [0.04, 0.055, 0.035], drop: 0.045 });
      legs(b, J, "Ninja stage suit", { upper: [0.074, 0.066], lower: [0.06, 0.055] });
      for (const [side] of [L, R]) b.limb("Wrap", vec.lerp(J[`${side}Leg`], J[`${side}Foot`], 0.45), J[`${side}Foot`], 0.058, 0.054, `${side}Leg`, `${side}Foot`, { caps: false });
      feet(b, J, "Ninja stage suit", { r: [0.065, 0.05, 0.12], forward: 0.045, exp: 0.8 });
    },
  },
};

export default figuren;
