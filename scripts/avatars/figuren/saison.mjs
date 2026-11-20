// Vierte Runde: Saison-Figuren – Weihnachtsmann, Rentier, Schneemann (Dezember), Kürbiskopf, Vampir (Halloween)
import { vec } from "../geometry.mjs";
import { arms, comicFace, feet, hands, L, legs, R, ring, skirt, skirtSkin, torsoSkin } from "../parts.mjs";

const comicMaterials = {
  Ink: { color: "#120c0a", rough: 0.3 },
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

const figuren = {
  weihnachtsmann: {
    base: "rio-carnival",
    title: "Weihnachtsmann",
    materials: {
      ...comicMaterials,
      Skin: { color: "#f2c3a3", rough: 0.6 },
      "Santa stage suit": { color: "#c8102e", rough: 0.7 },
      Fur: { color: "#fbfbf7", rough: 0.95 },
      Belt: { color: "#141214", rough: 0.4 },
      "Buckle luminous trim": { color: "#ffd24a", emissive: 0.5 },
      Boots: { color: "#141214", rough: 0.35 },
    },
    // Lächeln vorn auf den Bart
    shift: { ...humanFace, FaceSmile: [0, -0.04, 0.075] },
    body(b, J, F) {
      b.blob("Skin", [0, 0.73, 0], [0.165, 0.19, 0.165], "Head", { seg: 28 });
      b.blob("Skin", [0, 0.69, 0.165], [0.03, 0.028, 0.025], "Head");
      comicFace(b, F, { eye: [0.02, 0.024, 0.01], smile: [0.03, 0.012, 0.008] });
      // Rauschebart und Schnurrbart, Augenbrauen buschig
      b.blob("Fur", [0, 0.6, 0.08], [0.15, 0.17, 0.11], "Head", { seg: 24 });
      for (const s of [1, -1]) b.blob("Fur", [0.045 * s, 0.665, 0.165], [0.05, 0.02, 0.025], "Head", { rot: [0, 0, -0.3 * s] });
      // Zipfelmütze mit Pelzrand und Bommel (nach hinten gekippt)
      ring(b, "Fur", [0, 0.86, -0.01], 0.16, 0.16, 0.035, "Head");
      b.tube("Santa stage suit", [[0, 0.86, -0.01], [0, 0.98, -0.03], [-0.04, 1.06, -0.1], [-0.1, 1.08, -0.18]], (t) => 0.16 * (1 - t) + 0.02, "Head", { seg: 18 });
      b.blob("Fur", [-0.11, 1.08, -0.2], [0.04, 0.04, 0.04], "Head");
      // runder Bauch, Pelzbesatz vorn, Gürtel mit Schnalle, Stiefel
      b.blob("Santa stage suit", [0, 0.18, 0.02], [0.27, 0.33, 0.23], torsoSkin, { seg: 30 });
      b.blob("Fur", [0, 0.2, 0.2], [0.04, 0.26, 0.06], torsoSkin);
      ring(b, "Belt", [0, 0.06, 0.02], 0.265, 0.225, 0.03, torsoSkin, 28);
      b.blob("Buckle luminous trim", [0, 0.06, 0.25], [0.05, 0.04, 0.012], "Spine", { exp: 0.4 });
      b.blob("Santa stage suit", [0, -0.1, 0], [0.22, 0.12, 0.18], "Hips");
      ring(b, "Fur", [0, -0.17, 0], 0.22, 0.18, 0.03, "Hips", 28);
      arms(b, J, "Santa stage suit", { upper: [0.072, 0.066], lower: [0.064, 0.06], shoulder: 0.08 });
      for (const [side] of [L, R]) b.limb("Fur", vec.lerp(J[`${side}ForeArm`], J[`${side}Hand`], 0.82), J[`${side}Hand`], 0.068, 0.066, `${side}ForeArm`, null, { caps: false, steps: 1 });
      hands(b, J, "Fur", { r: [0.05, 0.06, 0.045], drop: 0.045 });
      legs(b, J, "Santa stage suit", { upper: [0.09, 0.08], lower: [0.075, 0.07] });
      for (const [side] of [L, R]) b.limb("Boots", vec.lerp(J[`${side}Leg`], J[`${side}Foot`], 0.5), J[`${side}Foot`], 0.08, 0.075, `${side}Leg`, `${side}Foot`, { caps: false });
      feet(b, J, "Boots", { r: [0.08, 0.07, 0.14], forward: 0.045, exp: 0.6 });
    },
  },

  rentier: {
    base: "rio-carnival",
    title: "Rentier",
    materials: {
      ...comicMaterials,
      "Deer stage suit": { color: "#8a5634", rough: 0.85 },
      "Belly armor": { color: "#e8d2b0", rough: 0.85 },
      Antler: { color: "#d9c7a3", rough: 0.7 },
      "Nose glow": { color: "#ff2238", emissive: 1 },
      "Collar luminous trim": { color: "#2bb35a", emissive: 0.3 },
      Bell: { color: "#f2c94c", metal: 0.9, rough: 0.2 },
      Hoof: { color: "#2a1d16", rough: 0.5 },
    },
    shift: {
      FaceEyeLeft: [0.02, 0.01, 0.045],
      FaceEyeRight: [-0.02, 0.01, 0.045],
      FaceBrowLeft: [0.02, 0.012, 0.04],
      FaceBrowRight: [-0.02, 0.012, 0.04],
      FaceSmile: [0, -0.06, 0.13],
    },
    body(b, J, F) {
      // Kopf mit langer Schnauze, rote Leuchtnase, Ohren, Geweih
      b.blob("Deer stage suit", [0, 0.75, 0], [0.165, 0.17, 0.165], "Head", { seg: 28 });
      b.blob("Belly armor", [0, 0.64, 0.15], [0.095, 0.075, 0.11], "Head", { seg: 22 });
      b.blob("Nose glow", [0, 0.665, 0.26], [0.04, 0.035, 0.035], "Head");
      comicFace(b, F, { eye: [0.024, 0.03, 0.012], smile: [0.03, 0.01, 0.006] });
      for (const s of [1, -1]) {
        b.blob("Deer stage suit", [0.17 * s, 0.82, -0.01], [0.07, 0.025, 0.035], "Head", { rot: [0, 0, -0.5 * s] });
        const base = [0.08 * s, 0.9, -0.02];
        const tip = [0.22 * s, 1.12, -0.08];
        b.tube("Antler", [base, [0.13 * s, 1.0, -0.04], tip], (t) => 0.022 - 0.01 * t, "Head", { seg: 8 });
        b.tube("Antler", [[0.13 * s, 1.0, -0.04], [0.11 * s, 1.08, 0.0]], (t) => 0.016 - 0.006 * t, "Head", { seg: 8 });
        b.tube("Antler", [[0.18 * s, 1.07, -0.06], [0.26 * s, 1.08, -0.02]], (t) => 0.014 - 0.005 * t, "Head", { seg: 8 });
      }
      // Halsband mit Glöckchen, Körper mit hellem Bauch, kleiner Schwanz, Hufe
      ring(b, "Collar luminous trim", [0, 0.5, 0], 0.11, 0.1, 0.022, "Neck");
      b.blob("Bell", [0, 0.46, 0.115], [0.028, 0.028, 0.028], "Chest");
      b.blob("Deer stage suit", [0, 0.2, 0], [0.22, 0.3, 0.17], torsoSkin, { seg: 26 });
      b.blob("Belly armor", [0, 0.17, 0.1], [0.14, 0.22, 0.09], torsoSkin);
      b.blob("Belly armor", [0, -0.02, -0.17], [0.05, 0.06, 0.04], "Hips");
      arms(b, J, "Deer stage suit", { upper: [0.06, 0.054], lower: [0.05, 0.045], shoulder: 0.068 });
      hands(b, J, "Hoof", { r: [0.045, 0.05, 0.042], drop: 0.035 });
      legs(b, J, "Deer stage suit", { upper: [0.08, 0.066], lower: [0.06, 0.052] });
      feet(b, J, "Hoof", { r: [0.065, 0.055, 0.09], forward: 0.02, exp: 0.6 });
    },
  },

  schneemann: {
    base: "rio-carnival",
    title: "Schneemann",
    materials: {
      ...comicMaterials,
      "Snow stage suit": { color: "#f4f8ff", rough: 0.9 },
      Carrot: { color: "#ff7a1a", rough: 0.6 },
      Coal: { color: "#1b1b1f", rough: 0.6 },
      Stick: { color: "#6b4a2b", rough: 0.9 },
      "Scarf luminous trim": { color: "#e8223f", emissive: 0.25 },
      "Top hat armor": { color: "#151518", rough: 0.4 },
    },
    shift: {
      FaceEyeLeft: [0.01, 0.0, 0.07],
      FaceEyeRight: [-0.01, 0.0, 0.07],
      FaceBrowLeft: [0.01, 0.0, 0.065],
      FaceBrowRight: [-0.01, 0.0, 0.065],
      FaceSmile: [0, -0.015, 0.075],
    },
    body(b, J, F) {
      // Kopfkugel, Kohleaugen, Karottennase, Kohle-Lächeln, Zylinder
      b.blob("Snow stage suit", [0, 0.73, 0], [0.19, 0.19, 0.19], "Head", { seg: 28 });
      for (const side of ["Left", "Right"]) b.blob("Coal", F[`FaceEye${side}`], [0.022, 0.022, 0.014], `FaceEye${side}`);
      b.cone("Carrot", [0, 0.7, 0.18], [0, 0.69, 0.33], 0.032, "Head");
      for (let i = -2; i <= 2; i++) b.blob("Coal", vec.add(F.FaceSmile, [i * 0.024, -0.012 * (1 - (i * i) / 4), 0]), [0.011, 0.011, 0.009], "FaceSmile");
      b.blob("Top hat armor", [0, 0.88, -0.01], [0.2, 0.014, 0.19], "Head", { seg: 28 });
      b.tube("Top hat armor", [[0, 0.88, -0.01], [0, 1.06, -0.01]], 0.12, "Head", { seg: 24 });
      ring(b, "Scarf luminous trim", [0, 0.92, -0.01], 0.122, 0.122, 0.018, "Head");
      // Schal mit Ende, Bauchkugel mit Kohleknöpfen, große Unterkugel (folgt den Beinen), Stockarme
      ring(b, "Scarf luminous trim", [0, 0.53, 0], 0.15, 0.14, 0.04, "Neck");
      b.tube("Scarf luminous trim", [[0.08, 0.5, 0.13], [0.11, 0.38, 0.18], [0.12, 0.28, 0.2]], [0.04, 0.012], "Chest", { seg: 10 });
      b.blob("Snow stage suit", [0, 0.3, 0], [0.24, 0.22, 0.22], torsoSkin, { seg: 28 });
      for (const y of [0.4, 0.3, 0.2]) b.blob("Coal", [0, y, 0.215], [0.02, 0.02, 0.015], "Chest");
      const bottom = skirtSkin(0.0, -0.8);
      b.blob("Snow stage suit", [0, -0.38, 0], [0.34, 0.5, 0.32], bottom, { seg: 30 });
      for (const [side, s] of [L, R]) {
        const sh = J[`${side}Arm`];
        const h = J[`${side}Hand`];
        b.tube("Stick", [vec.add(sh, [0.04 * s, 0, 0]), J[`${side}ForeArm`], h], 0.016, (p) => (p[1] > J[`${side}ForeArm`][1] ? [[`${side}Arm`, 1]] : [[`${side}ForeArm`, 1]]), { seg: 8 });
        b.tube("Stick", [h, vec.add(h, [0.03 * s, -0.08, 0.01])], 0.009, `${side}Hand`, { seg: 6 });
        b.tube("Stick", [h, vec.add(h, [-0.025 * s, -0.08, 0.01])], 0.009, `${side}Hand`, { seg: 6 });
      }
    },
  },

  "kuerbis-kopf": {
    base: "rio-carnival",
    title: "Kuerbis Kopf",
    materials: {
      "Pumpkin armor": { color: "#ff7b1c", rough: 0.6 },
      Stem: { color: "#3f6b2a", rough: 0.8 },
      "Carved luminous trim": { color: "#ffd23a", emissive: 1 },
      "Cloak stage suit": { color: "#1d1a24", rough: 0.8 },
      Rags: { color: "#3a2d22", rough: 0.9 },
      Gloves: { color: "#2b2622", rough: 0.6 },
    },
    shift: {
      FaceEyeLeft: [0.02, 0.0, 0.1],
      FaceEyeRight: [-0.02, 0.0, 0.1],
      FaceBrowLeft: [0, 0, 0.09],
      FaceBrowRight: [0, 0, 0.09],
      FaceSmile: [0, -0.02, 0.105],
    },
    body(b, J, F) {
      // Kürbis aus gerippten Segmenten, Stiel, geschnitzte leuchtende Augen und Zackenmund
      for (let k = 0; k < 8; k++) {
        const a = (2 * Math.PI * k) / 8;
        b.blob("Pumpkin armor", [0.09 * Math.sin(a), 0.75, 0.09 * Math.cos(a)], [0.16, 0.17, 0.16], "Head", { seg: 20 });
      }
      b.tube("Stem", [[0, 0.9, 0], [0.02, 0.98, -0.01], [0.05, 1.01, -0.02]], (t) => 0.03 - 0.012 * t, "Head", { seg: 8 });
      for (const [side, s] of [L, R]) b.cone("Carved luminous trim", vec.add(F[`FaceEye${side}`], [0, -0.025, 0]), vec.add(F[`FaceEye${side}`], [0.005 * s, 0.03, 0.008]), 0.035, `FaceEye${side}`);
      const m = F.FaceSmile;
      const zig = Array.from({ length: 9 }, (_, i) => {
        const u = -1 + (2 * i) / 8;
        return vec.add(m, [u * 0.09, -0.025 * (1 - u * u) + (i % 2 ? 0.014 : -0.008), -Math.abs(u) * 0.03]);
      });
      b.tube("Carved luminous trim", zig, 0.012, "FaceSmile", { seg: 6 });
      // Vogelscheuchen-Umhang mit Fransen, Handschuhe, Stiefel
      ring(b, "Rags", [0, 0.53, 0], 0.11, 0.1, 0.025, "Neck");
      b.blob("Cloak stage suit", [0, 0.22, 0], [0.22, 0.28, 0.16], torsoSkin, { seg: 26 });
      const cloak = skirt(b, "Cloak stage suit", { top: 0.08, bottom: -0.35, r0: [0.2, 0.15], r1: [0.27, 0.21] });
      for (let k = 0; k < 14; k++) {
        const a = (2 * Math.PI * k) / 14;
        b.cone("Rags", [0.26 * Math.sin(a), -0.34, 0.2 * Math.cos(a)], [0.28 * Math.sin(a), -0.45 - 0.03 * (k % 2), 0.22 * Math.cos(a)], 0.035, cloak);
      }
      arms(b, J, "Cloak stage suit", { upper: [0.06, 0.054], lower: [0.052, 0.048], shoulder: 0.07 });
      for (const [side] of [L, R]) b.cone("Rags", vec.lerp(J[`${side}ForeArm`], J[`${side}Hand`], 0.85), vec.lerp(J[`${side}ForeArm`], J[`${side}Hand`], 1.08), 0.06, `${side}ForeArm`);
      hands(b, J, "Gloves", { r: [0.045, 0.055, 0.04], drop: 0.045 });
      legs(b, J, "Rags", { upper: [0.072, 0.064], lower: [0.06, 0.055] });
      feet(b, J, "Gloves", { r: [0.075, 0.065, 0.13], forward: 0.045, exp: 0.6 });
    },
  },

  "vampir-vlad": {
    base: "aurora-synth",
    title: "Vampir Vlad",
    materials: {
      Ink: { color: "#120c10", rough: 0.3 },
      "Eye sparkle": { color: "#ff4060", emissive: 0.9 },
      Skin: { color: "#e6e3ea", rough: 0.5 },
      Hair: { color: "#0e0d12", metal: 0.3, rough: 0.2 },
      "Cape stage suit": { color: "#141218", rough: 0.5 },
      Cape: { color: "#141218", rough: 0.5, double: true },
      "Lining luminous trim": { color: "#b0102a", emissive: 0.25, double: true },
      "Vest armor": { color: "#6d0f1f", rough: 0.5 },
      Shirt: { color: "#f7f7f5", rough: 0.7 },
      Fang: { color: "#ffffff", rough: 0.3 },
      Shoes: { color: "#0d0d10", rough: 0.3, metal: 0.2 },
    },
    shift: humanFace,
    body(b, J, F) {
      b.blob("Skin", [0, 0.73, 0], [0.155, 0.195, 0.16], "Head", { seg: 28 });
      for (const s of [1, -1]) b.cone("Skin", [0.15 * s, 0.73, 0], [0.2 * s, 0.79, -0.02], 0.025, "Head");
      comicFace(b, F, { eye: [0.02, 0.024, 0.01], smile: [0.03, 0.01, 0.006] });
      for (const s of [1, -1]) b.cone("Fang", vec.add(F.FaceSmile, [0.017 * s, -0.004, 0.004]), vec.add(F.FaceSmile, [0.017 * s, -0.03, 0.008]), 0.007, "FaceSmile");
      // zurückgekämmtes Haar mit Spitze in der Stirn
      b.blob("Hair", [0, 0.82, -0.05], [0.165, 0.12, 0.14], "Head", { seg: 22 });
      b.cone("Hair", [0, 0.88, 0.07], [0, 0.8, 0.15], 0.06, "Head");
      // Umhang mit Stehkragen (innen rot), Weste, Rüschenhemd
      b.blob("Shirt", [0, 0.39, 0.03], [0.11, 0.09, 0.1], "Chest");
      b.blob("Vest armor", [0, 0.2, 0], [0.2, 0.25, 0.15], torsoSkin, { seg: 24 });
      b.blob("Shirt", [0, 0.36, 0.15], [0.04, 0.08, 0.03], "Chest");
      for (const s of [1, -1]) {
        b.blob("Cape stage suit", [0.15 * s, 0.6, -0.06], [0.11, 0.17, 0.03], "Chest", { rot: [0.25, 0.5 * s, 0.25 * s] });
        b.blob("Lining luminous trim", [0.145 * s, 0.6, -0.04], [0.095, 0.15, 0.02], "Chest", { rot: [0.25, 0.5 * s, 0.25 * s] });
      }
      const capeSkin = (p) => (p[1] > 0.25 ? [["Chest", 1]] : p[1] > 0.0 ? [["Spine", 1]] : [["Hips", 1]]);
      const capePath = Array.from({ length: 10 }, (_, i) => [0, 0.45 - (1.3 * i) / 9, -0.04]);
      // außen schwarz, innen rot (etwas kleiner) – offen nach vorn
      b.tube("Cape", capePath, (t) => [0.27 + 0.11 * t, 0.2 + 0.07 * t], capeSkin, { seg: 22, caps: false, arc: [-0.25, Math.PI + 0.25] });
      b.tube("Lining luminous trim", capePath, (t) => [0.262 + 0.11 * t, 0.192 + 0.07 * t], capeSkin, { seg: 22, caps: false, arc: [-0.25, Math.PI + 0.25] });
      arms(b, J, "Cape stage suit", { upper: [0.058, 0.052], lower: [0.05, 0.045], shoulder: 0.066 });
      hands(b, J, "Skin", { r: [0.038, 0.06, 0.032], drop: 0.05 });
      legs(b, J, "Cape stage suit", { upper: [0.068, 0.06], lower: [0.056, 0.05] });
      feet(b, J, "Shoes", { r: [0.065, 0.05, 0.13], forward: 0.05, exp: 0.6 });
    },
  },
};

export default figuren;
