// Dritte Runde: Trachten-Paar (Dirndl, Lederhose), Rock'n'Roll-Tolle, Disco-King, Mariachi
import { vec } from "../geometry.mjs";
import { arms, brimHat, comicFace, feet, hands, L, legs, R, ring, skirt, torsoSkin } from "../parts.mjs";

/** Gesicht ein Stück nach vorn auf den Menschenkopf (Radius ~0,165) */
const humanFace = {
  FaceEyeLeft: [0, -0.01, 0.035],
  FaceEyeRight: [0, -0.01, 0.035],
  FaceBrowLeft: [0, -0.012, 0.035],
  FaceBrowRight: [0, -0.012, 0.035],
  FaceSmile: [0, -0.015, 0.04],
};

const comicMaterials = {
  Ink: { color: "#1a120d", rough: 0.3 },
  "Eye sparkle": { color: "#ffffff", emissive: 0.8 },
};

function humanHead(b, F, skin, { r = [0.162, 0.188, 0.162], ears = true, smile = [0.035, 0.012, 0.007] } = {}) {
  b.blob(skin, [0, 0.73, 0], r, "Head", { seg: 28 });
  if (ears) for (const s of [1, -1]) b.blob(skin, [r[0] * s, 0.72, 0], [0.025, 0.04, 0.02], "Head");
  comicFace(b, F, { eye: [0.02, 0.025, 0.01], smile });
}

const figuren = {
  "dirndl-vroni": {
    base: "aurora-synth",
    title: "Dirndl Vroni",
    materials: {
      ...comicMaterials,
      Skin: { color: "#f0c4a4", rough: 0.6 },
      Hair: { color: "#d9a441", rough: 0.85 },
      Blouse: { color: "#fbf8f2", rough: 0.8 },
      "Bodice stage suit": { color: "#2f6b3e", rough: 0.6 },
      "Skirt armor": { color: "#a8233a", rough: 0.75 },
      Apron: { color: "#e9d9f2", rough: 0.8 },
      "Bow luminous trim": { color: "#ff6fb0", emissive: 0.4 },
      Silver: { color: "#e2e6ee", metal: 0.85, rough: 0.25 },
      Shoes: { color: "#1e1a1a", rough: 0.4 },
    },
    shift: humanFace,
    body(b, J, F) {
      humanHead(b, F, "Skin", { smile: [0.032, 0.013, 0.007] });
      // geflochtener Haarkranz, Haare hinten
      b.blob("Hair", [0, 0.79, -0.05], [0.168, 0.15, 0.14], "Head", { seg: 24 });
      b.tube(
        "Hair",
        Array.from({ length: 33 }, (_, i) => {
          const a = (2 * Math.PI * i) / 32;
          return [0.15 * Math.sin(a), 0.86 + 0.012 * Math.sin(a * 8), -0.01 + 0.14 * Math.cos(a)];
        }),
        0.03,
        "Head",
        { seg: 10, caps: false },
      );
      // Bluse mit Puffärmeln, Mieder mit Silberknöpfen, Rock, Schürze mit Schleife
      b.blob("Blouse", [0, 0.4, 0.02], [0.17, 0.08, 0.12], "Chest");
      b.blob("Bodice stage suit", [0, 0.22, 0], [0.18, 0.21, 0.135], torsoSkin, { seg: 26 });
      for (let k = 0; k < 4; k++) b.blob("Silver", [0, 0.32 - k * 0.055, 0.137], [0.012, 0.012, 0.008], "Chest");
      const skin = skirt(b, "Skirt armor", { top: 0.06, bottom: -0.5, r0: [0.17, 0.14], r1: [0.32, 0.27] });
      b.blob("Apron", [0, -0.2, 0.2], [0.17, 0.27, 0.06], skin, { exp: [0.5, 0.8], seg: 18 });
      for (const s of [1, -1]) b.blob("Bow luminous trim", [0.1 + 0.035 * s, 0.04, 0.15], [0.035, 0.022, 0.015], "Hips", { rot: [0, 0, 0.3 * s] });
      ring(b, "Bow luminous trim", [0, 0.045, 0], 0.175, 0.145, 0.012, "Hips");
      for (const [side] of [L, R]) b.blob("Blouse", J[`${side}Arm`], [0.07, 0.065, 0.07], `${side}Arm`);
      arms(b, J, "Skin", { upper: [0.045, 0.04], lower: [0.04, 0.035], shoulder: 0.001 });
      hands(b, J, "Skin", { r: [0.032, 0.05, 0.03], drop: 0.045 });
      legs(b, J, "Blouse", { upper: [0.055, 0.05], lower: [0.045, 0.04] });
      feet(b, J, "Shoes", { r: [0.055, 0.045, 0.11], forward: 0.04, exp: 0.7 });
    },
  },

  "lederhosn-sepp": {
    base: "rio-carnival",
    title: "Lederhosn Sepp",
    materials: {
      ...comicMaterials,
      Skin: { color: "#e3ab88", rough: 0.6 },
      Hair: { color: "#5a3a22", rough: 0.85 },
      "Checked stage suit": { color: "#d9e4f2", rough: 0.8 },
      "Leather armor": { color: "#6a4328", rough: 0.7 },
      Hat: { color: "#3c4a33", rough: 0.85 },
      "Edelweiss luminous trim": { color: "#f4f1e6", emissive: 0.4 },
      Socks: { color: "#efe7d4", rough: 0.95 },
      Shoes: { color: "#4a2f1c", rough: 0.5 },
      Feather: { color: "#2b2b2b", rough: 0.6 },
    },
    shift: humanFace,
    body(b, J, F) {
      humanHead(b, F, "Skin");
      b.blob("Hair", [0, 0.79, -0.05], [0.168, 0.13, 0.14], "Head", { seg: 22 });
      // Trachtenhut mit Feder (Gamsbart)
      brimHat(b, "Hat", "Edelweiss luminous trim", { y: 0.88, brim: [0.22, 0.2], crown: [0.13, 0.1, 0.13] });
      b.tube("Feather", [[0.1, 0.9, -0.08], [0.15, 1.03, -0.12], [0.17, 1.1, -0.1]], (t) => 0.02 * (1 - t * 0.7), "Head", { seg: 8 });
      // Hemd, Hosenträger mit Brustlatz und Edelweiß, kurze Lederhose, Wadenstutzen, Haferlschuhe
      b.blob("Checked stage suit", [0, 0.23, 0], [0.22, 0.27, 0.16], torsoSkin, { seg: 28 });
      for (const s of [1, -1])
        b.tube("Leather armor", [[0.09 * s, 0.03, 0.155], [0.095 * s, 0.25, 0.17], [0.11 * s, 0.44, 0.1], [0.11 * s, 0.46, -0.06], [0.08 * s, 0.25, -0.16], [0.07 * s, 0.03, -0.15]], 0.016, torsoSkin, { seg: 8 });
      b.blob("Leather armor", [0, 0.25, 0.172], [0.11, 0.035, 0.012], "Chest", { exp: 0.5 });
      b.blob("Edelweiss luminous trim", [0, 0.25, 0.186], [0.022, 0.022, 0.008], "Chest");
      b.blob("Leather armor", [0, -0.06, 0], [0.2, 0.1, 0.15], "Hips");
      arms(b, J, "Checked stage suit", { upper: [0.06, 0.054], lower: [0.052, 0.046], shoulder: 0.068 });
      hands(b, J, "Skin", { r: [0.04, 0.055, 0.035], drop: 0.045 });
      for (const [side] of [L, R]) {
        const hip = J[`${side}UpLeg`];
        const knee = J[`${side}Leg`];
        const foot = J[`${side}Foot`];
        b.limb("Leather armor", hip, vec.lerp(hip, knee, 0.75), 0.085, 0.078, `${side}UpLeg`, null);
        b.limb("Skin", vec.lerp(hip, knee, 0.7), knee, 0.065, 0.06, `${side}UpLeg`, `${side}Leg`);
        b.limb("Skin", knee, vec.lerp(knee, foot, 0.3), 0.058, 0.057, `${side}Leg`, null);
        b.limb("Socks", vec.lerp(knee, foot, 0.25), foot, 0.065, 0.055, `${side}Leg`, `${side}Foot`);
      }
      feet(b, J, "Shoes", { r: [0.075, 0.06, 0.13], forward: 0.045, exp: 0.6 });
    },
  },

  "tolle-teddy": {
    base: "rio-carnival",
    title: "Tolle Teddy",
    materials: {
      ...comicMaterials,
      Skin: { color: "#e8b896", rough: 0.6 },
      Hair: { color: "#14110f", metal: 0.3, rough: 0.2 },
      "Leather stage suit": { color: "#1c1c22", metal: 0.15, rough: 0.3 },
      Tee: { color: "#f4f4f2", rough: 0.8 },
      "Denim armor": { color: "#2c4f8a", rough: 0.85 },
      "Piping luminous trim": { color: "#ff3b5c", emissive: 0.4 },
      Creepers: { color: "#2a1c18", rough: 0.6 },
      Sole: { color: "#f2efe6", rough: 0.6 },
    },
    shift: humanFace,
    body(b, J, F) {
      humanHead(b, F, "Skin");
      // Haartolle: nach vorn gekämmt, glänzend; Koteletten
      b.blob("Hair", [0, 0.8, -0.05], [0.168, 0.12, 0.14], "Head", { seg: 22 });
      b.blob("Hair", [0, 0.93, 0.06], [0.11, 0.075, 0.13], "Head", { seg: 22, rot: [-0.35, 0, 0] });
      b.blob("Hair", [0, 0.96, 0.14], [0.08, 0.05, 0.07], "Head", { seg: 18, rot: [-0.6, 0, 0] });
      for (const s of [1, -1]) b.blob("Hair", [0.152 * s, 0.7, 0.05], [0.014, 0.045, 0.02], "Head");
      // Lederjacke mit hochgestelltem Kragen und Paspel, weißes Shirt, Jeans mit Aufschlag, Creepers
      b.blob("Leather stage suit", [0, 0.23, 0], [0.23, 0.27, 0.165], torsoSkin, { seg: 28 });
      b.blob("Tee", [0, 0.26, 0.13], [0.08, 0.2, 0.05], torsoSkin, { seg: 16 });
      for (const s of [1, -1]) {
        b.blob("Leather stage suit", [0.1 * s, 0.5, -0.02], [0.06, 0.07, 0.1], "Chest", { rot: [0, 0, 0.3 * s] });
        b.tube("Piping luminous trim", [[0.08 * s, 0.42, 0.14], [0.085 * s, 0.25, 0.16], [0.08 * s, 0.03, 0.15]], 0.008, torsoSkin, { seg: 6 });
      }
      b.blob("Denim armor", [0, -0.06, 0], [0.19, 0.09, 0.14], "Hips");
      arms(b, J, "Leather stage suit", { upper: [0.062, 0.056], lower: [0.054, 0.048], shoulder: 0.072 });
      hands(b, J, "Skin", { r: [0.04, 0.055, 0.035], drop: 0.045 });
      legs(b, J, "Denim armor", { upper: [0.074, 0.064], lower: [0.06, 0.056] });
      for (const [side] of [L, R]) b.limb("Denim armor", vec.lerp(J[`${side}Leg`], J[`${side}Foot`], 0.85), J[`${side}Foot`], 0.068, 0.068, `${side}Leg`, `${side}Foot`, { caps: false, steps: 1 });
      feet(b, J, "Creepers", { r: [0.075, 0.055, 0.135], forward: 0.045, exp: 0.5 });
      for (const [side] of [L, R]) {
        const f = J[`${side}Foot`];
        b.blob("Sole", [f[0], -0.985, f[2] + 0.045], [0.078, 0.02, 0.138], `${side}Foot`, { exp: [0.5, 0.4] });
      }
    },
  },

  "disco-king": {
    base: "aurora-synth",
    title: "Disco King",
    materials: {
      ...comicMaterials,
      Skin: { color: "#b97a52", rough: 0.6 },
      Hair: { color: "#1d1410", rough: 0.9 },
      "White stage suit": { color: "#f4f1ea", rough: 0.45 },
      "Shirt luminous trim": { color: "#ff9f1c", emissive: 0.35 },
      Gold: { color: "#f2c94c", metal: 0.95, rough: 0.2 },
      "Platform armor": { color: "#c63b9a", metal: 0.4, rough: 0.3 },
    },
    shift: humanFace,
    body(b, J, F) {
      humanHead(b, F, "Skin", { smile: [0.04, 0.016, 0.007] });
      // großer, runder Afro und Koteletten
      b.blob("Hair", [0, 0.82, -0.06], [0.24, 0.2, 0.2], "Head", { seg: 26 });
      for (const s of [1, -1]) b.blob("Hair", [0.155 * s, 0.69, 0.04], [0.016, 0.06, 0.03], "Head");
      // weißer Anzug, Hemd mit riesigem Kragen (offen), Goldkette mit Medaillon, Schlaghosen, Plateauschuhe
      b.blob("White stage suit", [0, 0.23, 0], [0.225, 0.27, 0.16], torsoSkin, { seg: 28 });
      b.blob("Shirt luminous trim", [0, 0.3, 0.12], [0.07, 0.15, 0.05], "Chest");
      b.blob("Skin", [0, 0.36, 0.15], [0.04, 0.08, 0.02], "Chest");
      for (const s of [1, -1]) b.blob("Shirt luminous trim", [0.1 * s, 0.43, 0.1], [0.1, 0.03, 0.06], "Chest", { rot: [0.4, 0, -0.5 * s] });
      ring(b, "Gold", [0, 0.39, 0.06], 0.07, 0.1, 0.006, "Chest");
      b.blob("Gold", [0, 0.3, 0.17], [0.03, 0.03, 0.01], "Chest");
      b.blob("White stage suit", [0, -0.06, 0], [0.19, 0.09, 0.14], "Hips");
      ring(b, "Gold", [0, 0.0, 0], 0.19, 0.145, 0.012, "Hips");
      arms(b, J, "White stage suit", { upper: [0.062, 0.056], lower: [0.054, 0.05], shoulder: 0.072 });
      hands(b, J, "Skin", { r: [0.04, 0.055, 0.035], drop: 0.045 });
      for (const [side] of [L, R]) {
        b.limb("White stage suit", J[`${side}UpLeg`], J[`${side}Leg`], 0.075, 0.06, `${side}UpLeg`, `${side}Leg`);
        b.tube("White stage suit", [J[`${side}Leg`], vec.lerp(J[`${side}Leg`], J[`${side}Foot`], 0.5), vec.add(J[`${side}Foot`], [0, -0.02, 0])], (t) => 0.058 + 0.06 * t * t, () => [[`${side}Leg`, 0.6], [`${side}Foot`, 0.4]], { seg: 16, caps: false });
      }
      feet(b, J, "Platform armor", { r: [0.075, 0.07, 0.13], forward: 0.04, exp: 0.4 });
    },
  },

  "mariachi-miguel": {
    base: "rio-carnival",
    title: "Mariachi Miguel",
    materials: {
      ...comicMaterials,
      Skin: { color: "#c98e64", rough: 0.6 },
      Hair: { color: "#1a1210", rough: 0.85 },
      Mustache: { color: "#1a1210", rough: 0.9 },
      "Charro stage suit": { color: "#141418", rough: 0.5 },
      "Silver armor": { color: "#dfe3ea", metal: 0.85, rough: 0.25 },
      Sombrero: { color: "#e9d3a0", rough: 0.75 },
      "Bow luminous trim": { color: "#e8223f", emissive: 0.35 },
      Shirt: { color: "#f6f4ef", rough: 0.8 },
      Boots: { color: "#1c1612", rough: 0.4 },
    },
    shift: humanFace,
    body(b, J, F) {
      humanHead(b, F, "Skin");
      b.blob("Hair", [0, 0.79, -0.05], [0.168, 0.12, 0.14], "Head", { seg: 22 });
      for (const s of [1, -1]) b.blob("Mustache", [0.035 * s, 0.675, 0.165], [0.042, 0.016, 0.02], "Head", { rot: [0, 0, -0.35 * s] });
      // Sombrero: breite, aufgebogene Krempe, hohe Krone, verziertes Band
      b.blob("Sombrero", [0, 0.88, 0], [0.42, 0.022, 0.4], "Head", { seg: 36 });
      ring(b, "Sombrero", [0, 0.9, 0], 0.42, 0.4, 0.03, "Head", 36);
      b.blob("Sombrero", [0, 1.0, -0.01], [0.14, 0.14, 0.14], "Head", { exp: [0.9, 0.8], seg: 24 });
      ring(b, "Silver armor", [0, 0.9, -0.01], 0.145, 0.145, 0.016, "Head");
      // kurze Charro-Jacke mit Silberstickerei, großer roter Moño, Hose mit Silberknöpfen an der Seite, Stiefel
      b.blob("Shirt", [0, 0.25, 0.02], [0.2, 0.24, 0.15], torsoSkin, { seg: 24 });
      for (const s of [1, -1]) b.blob("Charro stage suit", [0.12 * s, 0.28, 0], [0.12, 0.2, 0.165], torsoSkin, { seg: 22 });
      b.blob("Charro stage suit", [0, 0.32, -0.05], [0.22, 0.2, 0.12], torsoSkin);
      for (const s of [1, -1]) {
        for (let k = 0; k < 3; k++) b.blob("Silver armor", [0.13 * s, 0.34 - k * 0.07, 0.155], [0.012, 0.012, 0.008], "Chest");
        b.blob("Bow luminous trim", [0.055 * s, 0.44, 0.15], [0.06, 0.035, 0.02], "Chest", { rot: [0, 0, 0.3 * s] });
      }
      b.blob("Bow luminous trim", [0, 0.44, 0.16], [0.022, 0.022, 0.02], "Chest");
      b.blob("Charro stage suit", [0, -0.06, 0], [0.19, 0.1, 0.14], "Hips");
      arms(b, J, "Charro stage suit", { upper: [0.06, 0.054], lower: [0.052, 0.048], shoulder: 0.07 });
      hands(b, J, "Skin", { r: [0.04, 0.055, 0.035], drop: 0.045 });
      legs(b, J, "Charro stage suit", { upper: [0.074, 0.064], lower: [0.06, 0.056] });
      for (const [side, s] of [L, R])
        for (let k = 0; k < 6; k++) {
          const p = vec.lerp(J[`${side}UpLeg`], J[`${side}Foot`], 0.1 + k * 0.13);
          b.blob("Silver armor", vec.add(p, [0.07 * s, 0, 0]), [0.01, 0.01, 0.01], k < 3 ? `${side}UpLeg` : `${side}Leg`);
        }
      feet(b, J, "Boots", { r: [0.072, 0.07, 0.135], forward: 0.045, exp: 0.6 });
    },
  },
};

export default figuren;
