// Zweite Runde: Cowboy, Skelett, Katze, Ritter, Frack-Pinguin, Rapperin
import { byHeight, smoothstep, vec } from "../geometry.mjs";
import { arms, comicFace, feet, hands, L, legs, R, torsoSkin } from "../parts.mjs";

const figuren = {
  "cowboy-joe": {
    base: "rio-carnival",
    title: "Cowboy Joe",
    materials: {
      "Plaid stage suit": { color: "#a3262a", rough: 0.8 },
      "Leather armor": { color: "#6b4426", rough: 0.6 },
      Skin: { color: "#d9a07a", rough: 0.65 },
      Denim: { color: "#33507e", rough: 0.85 },
      Hat: { color: "#c49a62", rough: 0.75 },
      "Bandana luminous trim": { color: "#e8433a", emissive: 0.3 },
      Buckle: { color: "#e3c56b", metal: 0.9, rough: 0.25 },
      Ink: { color: "#1a120d", rough: 0.3 },
      "Eye sparkle": { color: "#ffffff", emissive: 0.8 },
      Mustache: { color: "#4a2e1c", rough: 0.9 },
    },
    shift: {
      FaceEyeLeft: [0, -0.01, 0.035],
      FaceEyeRight: [0, -0.01, 0.035],
      FaceBrowLeft: [0, -0.015, 0.035],
      FaceBrowRight: [0, -0.015, 0.035],
      FaceSmile: [0, -0.02, 0.04],
    },
    body(b, J, F) {
      // Kopf, Schnurrbart, Cowboyhut (Krempe vorn und hinten leicht hochgebogen)
      b.blob("Skin", [0, 0.73, 0], [0.165, 0.19, 0.165], "Head", { seg: 28 });
      for (const s of [1, -1]) b.blob("Skin", [0.165 * s, 0.72, 0], [0.025, 0.04, 0.02], "Head");
      comicFace(b, F, { eye: [0.02, 0.025, 0.01], smile: [0.035, 0.012, 0.007] });
      for (const s of [1, -1]) b.blob("Mustache", [0.035 * s, 0.675, 0.165], [0.042, 0.016, 0.02], "Head", { rot: [0, 0, -0.35 * s] });
      b.blob("Hat", [0, 0.88, 0], [0.33, 0.022, 0.29], "Head", { seg: 32 });
      for (const s of [1, -1]) b.blob("Hat", [0.27 * s, 0.9, 0], [0.07, 0.03, 0.24], "Head", { rot: [0, 0, 0.5 * s] });
      b.blob("Hat", [0, 0.96, -0.01], [0.15, 0.1, 0.15], "Head", { exp: [0.8, 0.7], seg: 24 });
      b.tube("Leather armor", Array.from({ length: 25 }, (_, i) => {
        const a = (2 * Math.PI * i) / 24;
        return [0.152 * Math.sin(a), 0.9, 0.152 * Math.cos(a) - 0.01];
      }), 0.014, "Head", { seg: 6, caps: false });
      // Halstuch, Karohemd mit Lederweste, Gürtelschnalle, Jeans, Stiefel mit Absatz
      b.blob("Bandana luminous trim", [0, 0.47, 0.06], [0.11, 0.04, 0.1], "Chest");
      b.cone("Bandana luminous trim", [0, 0.46, 0.14], [0, 0.36, 0.17], 0.05, "Chest");
      b.blob("Leather armor", [0, 0.23, 0], [0.225, 0.27, 0.16], torsoSkin, { seg: 28 });
      b.blob("Plaid stage suit", [0, 0.26, 0.12], [0.075, 0.2, 0.06], torsoSkin, { seg: 18 });
      for (const s of [1, -1]) b.blob("Buckle", [0.06 * s, 0.24, 0.167], [0.01, 0.01, 0.006], "Chest");
      b.blob("Leather armor", [0, -0.01, 0], [0.2, 0.035, 0.15], "Hips");
      b.blob("Buckle", [0, -0.01, 0.15], [0.045, 0.03, 0.012], "Hips", { exp: 0.5 });
      b.blob("Denim", [0, -0.07, 0], [0.19, 0.08, 0.14], "Hips");
      arms(b, J, "Plaid stage suit", { upper: [0.06, 0.054], lower: [0.052, 0.046], shoulder: 0.068 });
      hands(b, J, "Skin", { r: [0.04, 0.055, 0.035], drop: 0.045 });
      legs(b, J, "Denim", { upper: [0.078, 0.066], lower: [0.064, 0.06] });
      for (const [side] of [L, R]) b.limb("Leather armor", vec.lerp(J[`${side}Leg`], J[`${side}Foot`], 0.45), J[`${side}Foot`], 0.07, 0.068, `${side}Leg`, `${side}Foot`, { caps: false });
      feet(b, J, "Leather armor", { r: [0.07, 0.07, 0.14], forward: 0.05, exp: 0.7 });
      for (const [side] of [L, R]) b.blob("Mustache", [J[`${side}Foot`][0], -0.975, J[`${side}Foot`][2] - 0.06], [0.04, 0.03, 0.035], `${side}Foot`, { exp: 0.5 });
    },
  },

  "knochen-kalle": {
    base: "rio-carnival",
    title: "Knochen Kalle",
    materials: {
      "Bone armor": { color: "#ece6d4", rough: 0.6 },
      "Shadow stage suit": { color: "#141218", rough: 0.7 },
      Ink: { color: "#08070a", rough: 0.4 },
      "Eye sparkle": { color: "#ffffff", emissive: 0.6 },
      "Soul luminous trim": { color: "#7dff6a", emissive: 1 },
    },
    shift: {
      FaceEyeLeft: [0.005, 0.0, 0.05],
      FaceEyeRight: [-0.005, 0.0, 0.05],
      FaceBrowLeft: [0, 0, 0.04],
      FaceBrowRight: [0, 0, 0.04],
      FaceSmile: [0, -0.04, 0.045],
    },
    body(b, J, F) {
      // Schädel mit Kiefer und Zahnreihe, tiefe Augenhöhlen mit glühenden Pupillen
      b.blob("Bone armor", [0, 0.76, -0.01], [0.17, 0.17, 0.17], "Head", { seg: 28 });
      b.blob("Bone armor", [0, 0.64, 0.05], [0.11, 0.06, 0.1], "Head", { exp: [0.8, 0.9] });
      for (const [side] of [L, R]) {
        const e = F[`FaceEye${side}`];
        b.blob("Ink", e, [0.042, 0.045, 0.02], `FaceEye${side}`);
        b.blob("Soul luminous trim", vec.add(e, [0, 0, 0.016]), [0.013, 0.013, 0.008], `FaceEye${side}`);
      }
      b.blob("Ink", [0, 0.7, 0.172], [0.018, 0.022, 0.01], "Head", { rot: [0, 0, Math.PI / 4], exp: 0.7 });
      for (let i = -3; i <= 3; i++) b.blob("Bone armor", vec.add(F.FaceSmile, [i * 0.016, 0, 0.004]), [0.007, 0.012, 0.006], "FaceSmile", { exp: 0.5, seg: 8 });
      b.arc("Ink", vec.add(F.FaceSmile, [0, 0.003, 0]), 0.058, 0.006, 0.003, "FaceSmile");
      // Wirbelsäule, Rippen, Becken – vor dunklem Grund (Schattenanzug)
      b.blob("Shadow stage suit", [0, 0.22, -0.02], [0.2, 0.27, 0.13], torsoSkin, { seg: 24 });
      for (let k = 0; k < 10; k++) {
        const y = -0.02 + k * 0.05;
        b.blob("Bone armor", [0, y, -0.1], [0.025, 0.02, 0.025], torsoSkin, { seg: 10 });
      }
      for (let k = 0; k < 5; k++) {
        const y = 0.38 - k * 0.055;
        const w = 0.2 - k * 0.012;
        const pts = Array.from({ length: 13 }, (_, i) => {
          const a = -Math.PI * 0.85 + (Math.PI * 1.7 * i) / 12;
          return [w * Math.sin(a), y - 0.025 * Math.cos(a), 0.14 * Math.cos(a) - 0.03];
        });
        b.tube("Bone armor", pts, 0.013, torsoSkin, { seg: 8 });
      }
      b.blob("Bone armor", [0, 0.26, 0.11], [0.025, 0.12, 0.02], "Chest");
      b.blob("Bone armor", [0, -0.04, 0], [0.17, 0.07, 0.11], "Hips", { exp: [0.6, 0.9] });
      for (const s of [1, -1]) b.tube("Bone armor", [[0.02 * s, 0.44, 0.06], [0.2 * s, 0.45, 0.02]], 0.014, "Chest", { seg: 8 });
      // Knochen-Glieder mit Knubbeln an den Gelenken
      for (const [side] of [L, R]) {
        b.blob("Bone armor", J[`${side}ForeArm`], [0.032, 0.032, 0.032], () => [[`${side}Arm`, 0.5], [`${side}ForeArm`, 0.5]]);
        b.blob("Bone armor", J[`${side}Leg`], [0.04, 0.04, 0.04], () => [[`${side}UpLeg`, 0.5], [`${side}Leg`, 0.5]]);
        b.blob("Bone armor", J[`${side}UpLeg`], [0.045, 0.045, 0.045], `${side}UpLeg`);
      }
      arms(b, J, "Bone armor", { upper: [0.022, 0.02], lower: [0.018, 0.017], shoulder: 0.04 });
      for (const [side, s] of [L, R]) {
        const h = J[`${side}Hand`];
        b.blob("Bone armor", vec.add(h, [0, -0.025, 0]), [0.03, 0.035, 0.018], `${side}Hand`);
        for (const dx of [-0.022, -0.007, 0.008, 0.022])
          b.tube("Bone armor", [vec.add(h, [dx * s, -0.05, 0.005]), vec.add(h, [dx * 1.15 * s, -0.1, 0.01])], 0.006, `${side}Hand`, { seg: 6 });
      }
      legs(b, J, "Bone armor", { upper: [0.026, 0.024], lower: [0.022, 0.02] });
      feet(b, J, "Bone armor", { r: [0.05, 0.03, 0.11], forward: 0.05, exp: 0.7 });
    },
  },

  "mietz-katze": {
    base: "aurora-synth",
    title: "Mietz Katze",
    materials: {
      "Fur stage suit": { color: "#f4efe9", rough: 0.9 },
      "Pink armor": { color: "#ff9cc8", rough: 0.75 },
      "Bell luminous trim": { color: "#ffd84a", emissive: 0.6 },
      Ink: { color: "#1a1420", rough: 0.2, metal: 0.1 },
      "Eye sparkle": { color: "#ffffff", emissive: 0.9 },
      Whisker: { color: "#3a3440", rough: 0.6 },
      Cream: { color: "#ffe9d2", rough: 0.85 },
    },
    shift: {
      FaceEyeLeft: [0.012, 0.0, 0.055],
      FaceEyeRight: [-0.012, 0.0, 0.055],
      FaceBrowLeft: [0.012, 0.0, 0.05],
      FaceBrowRight: [-0.012, 0.0, 0.05],
      FaceSmile: [0, -0.01, 0.06],
    },
    body(b, J, F) {
      // breiter Katzenkopf, spitze Ohren (innen rosa), Schnurrhaare, Näschen
      b.blob("Fur stage suit", [0, 0.74, 0], [0.2, 0.175, 0.175], "Head", { seg: 28 });
      for (const s of [1, -1]) {
        b.cone("Fur stage suit", [0.12 * s, 0.86, -0.01], [0.17 * s, 1.0, -0.02], 0.07, "Head");
        b.cone("Pink armor", [0.12 * s, 0.87, 0.02], [0.163 * s, 0.97, 0.005], 0.04, "Head");
        for (const dy of [0.0, -0.022])
          b.tube("Whisker", [[0.07 * s, 0.68 + dy, 0.16], [0.2 * s, 0.69 + dy * 1.6, 0.13]], 0.0035, "Head", { seg: 5 });
      }
      b.blob("Pink armor", [0, 0.695, 0.178], [0.02, 0.014, 0.012], "Head");
      comicFace(b, F, { eye: [0.028, 0.034, 0.012], brow: false, smile: [0.022, 0.01, 0.005] });
      // Halsband mit Glöckchen, schlanker Körper, heller Bauch, Schwanz
      b.tube("Pink armor", Array.from({ length: 25 }, (_, i) => {
        const a = (2 * Math.PI * i) / 24;
        return [0.1 * Math.sin(a), 0.5, 0.09 * Math.cos(a)];
      }), 0.018, "Neck", { seg: 8, caps: false });
      b.blob("Bell luminous trim", [0, 0.465, 0.105], [0.026, 0.026, 0.026], "Chest");
      b.blob("Fur stage suit", [0, 0.2, 0], [0.19, 0.29, 0.15], torsoSkin, { seg: 26 });
      b.blob("Cream", [0, 0.18, 0.1], [0.11, 0.2, 0.07], torsoSkin);
      const tail = Array.from({ length: 12 }, (_, i) => {
        const t = i / 11;
        return [0.08 * Math.sin(t * 3), -0.05 + 0.5 * t, -0.15 - 0.12 * Math.sin(t * 2.2)];
      });
      b.tube("Fur stage suit", tail, (t) => 0.035 - 0.012 * t, byHeight([[0.0, "Hips"], [0.25, "Spine"]]), { seg: 10 });
      b.blob("Pink armor", tail.at(-1), [0.03, 0.03, 0.03], "Spine");
      arms(b, J, "Fur stage suit", { upper: [0.05, 0.045], lower: [0.045, 0.04], shoulder: 0.06 });
      hands(b, J, "Fur stage suit", { r: [0.045, 0.05, 0.042], drop: 0.04 });
      legs(b, J, "Fur stage suit", { upper: [0.07, 0.058], lower: [0.055, 0.05] });
      feet(b, J, "Pink armor", { r: [0.07, 0.05, 0.11], forward: 0.04, exp: 0.9 });
    },
  },

  "eisen-ritter": {
    base: "ember-rock",
    title: "Eisen Ritter",
    materials: {
      "Steel armor": { color: "#d3d9e2", metal: 0.45, rough: 0.3 },
      "Chainmail stage suit": { color: "#7b828d", metal: 0.35, rough: 0.6 },
      "Slit visor": { color: "#050608", rough: 0.4 },
      "Plume luminous trim": { color: "#d81e3a", emissive: 0.35 },
      "Visor glow": { color: "#ffb347", emissive: 1 },
      Gold: { color: "#d8b24a", metal: 0.9, rough: 0.3 },
    },
    shift: {
      FaceVisorLeft: [-0.008, 0.0, 0.035],
      FaceVisorRight: [0.008, 0.0, 0.035],
      FaceMeter0: [0, 0.045, 0.058],
      FaceMeter1: [0, 0.045, 0.058],
      FaceMeter2: [0, 0.045, 0.058],
    },
    body(b, J, F) {
      // Topfhelm mit Sehschlitz (glühende Pegel darin), Atemlöcher, Federbusch
      b.blob("Steel armor", [0, 0.76, 0], [0.18, 0.21, 0.18], "Head", { exp: [0.45, 0.35], seg: 30 });
      b.blob("Slit visor", [0, 0.75, 0.165], [0.13, 0.018, 0.025], "Head", { exp: 0.4 });
      for (const side of ["Left", "Right"]) b.blob("Visor glow", F[`FaceVisor${side}`], [0.035, 0.007, 0.006], `FaceVisor${side}`, { exp: 0.5 });
      for (let i = 0; i < 3; i++) b.blob("Visor glow", F[`FaceMeter${i}`], [0.012, 0.007, 0.005], `FaceMeter${i}`, { exp: 0.5, seg: 8 });
      for (const [x, y] of [[-0.04, 0.66], [0, 0.66], [0.04, 0.66], [-0.02, 0.63], [0.02, 0.63]])
        b.blob("Slit visor", [x, y, 0.175], [0.008, 0.008, 0.006], "Head", { seg: 8 });
      b.blob("Gold", [0, 0.76, 0.17], [0.012, 0.2, 0.012], "Head", { exp: 0.6 });
      const plume = Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        return [0, 0.97 + 0.12 * Math.sin(t * 2.4), -0.02 - 0.28 * t];
      });
      b.tube("Plume luminous trim", plume, (t) => 0.05 * (1 - t * 0.6), "Head", { seg: 12 });
      // Brustpanzer, Schulterplatten, Kettenhemd, Gürtel, Arm- und Beinschienen
      b.blob("Chainmail stage suit", [0, 0.2, 0], [0.22, 0.3, 0.15], torsoSkin, { seg: 26 });
      b.blob("Steel armor", [0, 0.3, 0.035], [0.215, 0.18, 0.15], "Chest", { exp: [0.7, 0.6], seg: 26 });
      b.blob("Plume luminous trim", [0, 0.27, 0.18], [0.035, 0.1, 0.012], "Chest", { exp: 0.5 });
      b.blob("Plume luminous trim", [0, 0.29, 0.181], [0.09, 0.03, 0.012], "Chest", { exp: 0.5 });
      b.blob("Gold", [0, -0.01, 0], [0.2, 0.03, 0.15], "Hips");
      b.blob("Chainmail stage suit", [0, -0.1, 0], [0.2, 0.12, 0.15], "Hips");
      for (const [side, s] of [L, R]) b.blob("Steel armor", vec.add(J[`${side}Arm`], [0.02 * s, 0.03, 0]), [0.1, 0.06, 0.1], () => [[`${side}Arm`, 0.6], [`${side}Shoulder`, 0.4]], { exp: [0.8, 0.6] });
      arms(b, J, "Chainmail stage suit", { upper: [0.055, 0.05], lower: [0.05, 0.046], shoulder: 0.06 });
      for (const [side] of [L, R]) {
        const fa = J[`${side}ForeArm`];
        const h = J[`${side}Hand`];
        b.limb("Steel armor", vec.lerp(fa, h, 0.25), h, 0.058, 0.064, `${side}ForeArm`, null, { caps: false, steps: 2 });
      }
      hands(b, J, "Steel armor", { r: [0.05, 0.06, 0.045], drop: 0.045 });
      legs(b, J, "Chainmail stage suit", { upper: [0.075, 0.065], lower: [0.062, 0.058] });
      for (const [side] of [L, R]) {
        b.blob("Steel armor", J[`${side}Leg`], [0.065, 0.06, 0.07], () => [[`${side}UpLeg`, 0.5], [`${side}Leg`, 0.5]]);
        b.limb("Steel armor", vec.lerp(J[`${side}Leg`], J[`${side}Foot`], 0.15), J[`${side}Foot`], 0.07, 0.066, `${side}Leg`, `${side}Foot`, { caps: false });
      }
      feet(b, J, "Steel armor", { r: [0.075, 0.06, 0.15], forward: 0.05, exp: 0.5 });
    },
  },

  "frack-pinguin": {
    base: "rio-carnival",
    title: "Frack Pinguin",
    materials: {
      "Tux stage suit": { color: "#15161c", rough: 0.4 },
      "Belly armor": { color: "#f3f1ea", rough: 0.6 },
      Beak: { color: "#f39a1e", rough: 0.5 },
      "Bow luminous trim": { color: "#ff3d5a", emissive: 0.6 },
      Ink: { color: "#06060a", rough: 0.2 },
      "Eye white": { color: "#ffffff", rough: 0.4 },
      "Eye sparkle": { color: "#ffffff", emissive: 0.9 },
    },
    shift: {
      FaceEyeLeft: [0.005, -0.005, 0.07],
      FaceEyeRight: [-0.005, -0.005, 0.07],
      FaceBrowLeft: [0, 0, 0.06],
      FaceBrowRight: [0, 0, 0.06],
      FaceSmile: [0, -0.04, 0.08],
    },
    body(b, J, F) {
      // runder Kopf ohne Hals, weißes Gesicht, Schnabel
      b.blob("Tux stage suit", [0, 0.72, 0], [0.2, 0.2, 0.19], "Head", { seg: 28 });
      b.blob("Belly armor", [0, 0.71, 0.09], [0.15, 0.15, 0.12], "Head", { seg: 24 });
      for (const [side] of [L, R]) b.blob("Eye white", vec.add(F[`FaceEye${side}`], [0, 0, -0.006]), [0.036, 0.04, 0.014], `FaceEye${side}`);
      comicFace(b, F, { eye: [0.02, 0.024, 0.01], brow: false, smile: [0.001, 0.001, 0.001] });
      b.cone("Beak", [0, 0.665, 0.19], [0, 0.65, 0.29], 0.04, "Head");
      // Frack-Körper (Ei), weißer Bauch, Fliege, Frackschöße hinten
      const eggSkin = (p) =>
        p[1] < -0.12
          ? [["Hips", 0.6], [p[0] >= 0 ? "LeftUpLeg" : "RightUpLeg", 0.4 * smoothstep(-0.12, -0.6, p[1])]]
          : torsoSkin(p);
      b.blob("Tux stage suit", [0, 0.0, 0], [0.27, 0.56, 0.23], eggSkin, { seg: 30 });
      b.blob("Belly armor", [0, -0.02, 0.08], [0.21, 0.48, 0.18], eggSkin, { seg: 28 });
      for (const s of [1, -1]) b.blob("Bow luminous trim", [0.04 * s, 0.47, 0.17], [0.042, 0.026, 0.018], "Chest", { rot: [0, 0, 0.25 * s] });
      b.blob("Bow luminous trim", [0, 0.47, 0.18], [0.015, 0.015, 0.015], "Chest");
      for (const s of [1, -1]) b.blob("Tux stage suit", [0.08 * s, -0.45, -0.17], [0.07, 0.17, 0.04], "Hips", { rot: [0.25, 0, 0.12 * s] });
      // Flossen statt Arme, kurze Beine, große orange Füße
      for (const [side] of [L, R]) {
        b.limb("Tux stage suit", J[`${side}Arm`], J[`${side}ForeArm`], 0.06, 0.055, `${side}Arm`, `${side}ForeArm`);
        b.tube(
          "Tux stage suit",
          [J[`${side}ForeArm`], vec.lerp(J[`${side}ForeArm`], J[`${side}Hand`], 0.5), vec.add(J[`${side}Hand`], [0, -0.06, 0])],
          (t) => [0.055 * (1 - 0.6 * t), 0.022],
          () => [[`${side}ForeArm`, 0.6], [`${side}Hand`, 0.4]],
          { seg: 14, up: [0, 0, 1] },
        );
      }
      // Beine stecken im Körper – nur die kurzen Unterschenkel schauen heraus
      for (const [side] of [L, R])
        b.limb("Tux stage suit", vec.lerp(J[`${side}Leg`], J[`${side}Foot`], 0.2), J[`${side}Foot`], 0.045, 0.04, `${side}Leg`, `${side}Foot`);
      feet(b, J, "Beak", { r: [0.1, 0.03, 0.15], forward: 0.07, exp: 0.9 });
    },
  },

  "mc-flow": {
    base: "luna-flow",
    title: "MC Flow",
    materials: {
      "Puffer stage suit": { color: "#7a3cff", rough: 0.35, metal: 0.15 },
      "Cargo armor": { color: "#4a4f3e", rough: 0.85 },
      Skin: { color: "#6e4430", rough: 0.6 },
      Hair: { color: "#1c1210", rough: 0.95 },
      "Chain gold": { color: "#f2c94c", metal: 0.95, rough: 0.2 },
      "Sneaker luminous trim": { color: "#3df5ff", emissive: 0.6 },
      Sneaker: { color: "#f5f5f2", rough: 0.5 },
      Ink: { color: "#140d0b", rough: 0.3 },
      "Eye sparkle": { color: "#ffffff", emissive: 0.8 },
    },
    shift: {
      FaceEyeLeft: [0, 0, 0.032],
      FaceEyeRight: [0, 0, 0.032],
      FaceBrowLeft: [0, 0, 0.03],
      FaceBrowRight: [0, 0, 0.03],
      FaceSmile: [0, 0, 0.032],
    },
    body(b, J, F) {
      // Kopf mit zwei Haar-Puffs, Creolen
      b.blob("Skin", [0, 0.73, 0], [0.155, 0.185, 0.16], "Head", { seg: 28 });
      b.blob("Hair", [0, 0.86, -0.06], [0.17, 0.1, 0.14], "Head", { seg: 24 });
      for (const s of [1, -1]) b.blob("Hair", [0.14 * s, 0.94, -0.02], [0.095, 0.095, 0.095], "Head", { seg: 22 });
      comicFace(b, F, { eye: [0.02, 0.026, 0.01], smile: [0.036, 0.013, 0.007] });
      for (const s of [1, -1])
        b.tube("Chain gold", Array.from({ length: 17 }, (_, i) => {
          const a = (2 * Math.PI * i) / 16;
          return [0.16 * s, 0.62 + 0.035 * Math.sin(a), 0.01 + 0.035 * Math.cos(a)];
        }), 0.005, "Head", { seg: 6, caps: false });
      // Daunenjacke (gesteppt), Goldkette, Cargohose, dicke Sneaker
      for (let k = 0; k < 4; k++)
        b.blob("Puffer stage suit", [0, 0.06 + k * 0.11, 0], [0.25 - k * 0.006, 0.075, 0.18], torsoSkin, { seg: 26 });
      b.blob("Puffer stage suit", [0, 0.47, -0.02], [0.17, 0.06, 0.15], "Chest");
      b.tube("Chain gold", Array.from({ length: 13 }, (_, i) => {
        const a = -Math.PI * 0.45 + (Math.PI * 0.9 * i) / 12;
        return [0.13 * Math.sin(a), 0.45 - 0.17 * Math.cos(a), 0.12 + 0.07 * Math.cos(a)];
      }), 0.012, "Chest", { seg: 8 });
      b.blob("Chain gold", [0, 0.27, 0.205], [0.035, 0.035, 0.012], "Chest", { exp: 0.4 });
      b.blob("Cargo armor", [0, -0.07, 0], [0.19, 0.1, 0.14], "Hips");
      for (const [side] of [L, R])
        for (let k = 0; k < 3; k++) {
          const p = vec.lerp(J[`${side}Arm`], J[`${side}ForeArm`], 0.2 + k * 0.3);
          b.blob("Puffer stage suit", p, [0.075, 0.075, 0.075], `${side}Arm`);
        }
      arms(b, J, "Puffer stage suit", { upper: [0.068, 0.064], lower: [0.06, 0.055], shoulder: 0.08 });
      hands(b, J, "Skin", { r: [0.04, 0.055, 0.035], drop: 0.045 });
      legs(b, J, "Cargo armor", { upper: [0.085, 0.078], lower: [0.075, 0.07] });
      for (const [side] of [L, R]) b.blob("Cargo armor", vec.add(vec.lerp(J[`${side}UpLeg`], J[`${side}Leg`], 0.55), [0, 0, 0]), [0.095, 0.05, 0.08], `${side}UpLeg`);
      feet(b, J, "Sneaker", { r: [0.09, 0.075, 0.155], forward: 0.045, exp: 0.6 });
      for (const [side] of [L, R]) {
        const f = J[`${side}Foot`];
        b.blob("Sneaker luminous trim", [f[0], -0.985, f[2] + 0.045], [0.093, 0.018, 0.158], `${side}Foot`, { exp: [0.6, 0.4] });
      }
    },
  },
};

export default figuren;
