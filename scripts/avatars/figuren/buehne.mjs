// Erste Runde: Disco-Bär, Retro-Bot, Astronautin, Alien, Punk, Glitzer-Diva
import { smoothstep, vec } from "../geometry.mjs";
import { arms, comicFace, feet, hands, L, ledFace, legs, R, torsoSkin } from "../parts.mjs";

const figuren = {
  "disco-baer": {
    base: "rio-carnival",
    title: "Disco Baer",
    materials: {
      "Plush stage suit": { color: "#7a4a2a", rough: 0.9 },
      "Honey armor": { color: "#e2b980", rough: 0.85 },
      "Bow luminous trim": { color: "#ff3d9a", emissive: 0.6 },
      Ink: { color: "#120c0a", rough: 0.25, metal: 0.1 },
      "Eye sparkle": { color: "#ffffff", emissive: 0.8 },
    },
    // Gesicht nach vorn auf die runde Schnauze/Kopf, Lächeln unter die Schnauze
    shift: {
      FaceEyeLeft: [0.01, 0.005, 0.07],
      FaceEyeRight: [-0.01, 0.005, 0.07],
      FaceBrowLeft: [0.012, 0.01, 0.065],
      FaceBrowRight: [-0.012, 0.01, 0.065],
      FaceSmile: [0, -0.05, 0.1],
    },
    body(b, J, F) {
      // Kopf, Ohren, Schnauze, Nase
      b.blob("Plush stage suit", [0, 0.74, 0], [0.205, 0.19, 0.185], "Head", { seg: 28 });
      for (const s of [1, -1]) {
        b.blob("Plush stage suit", [0.15 * s, 0.9, -0.02], [0.07, 0.07, 0.045], "Head");
        b.blob("Honey armor", [0.15 * s, 0.9, 0.015], [0.042, 0.042, 0.02], "Head");
      }
      b.blob("Honey armor", [0, 0.665, 0.155], [0.095, 0.07, 0.065], "Head", { seg: 22 });
      b.blob("Ink", [0, 0.69, 0.215], [0.032, 0.022, 0.02], "Head");
      comicFace(b, F, { eye: [0.026, 0.03, 0.012], smile: [0.032, 0.012, 0.006] });
      // runder Bauch, heller Bauchfleck
      b.blob("Plush stage suit", [0, 0.17, 0.01], [0.27, 0.35, 0.235], torsoSkin, { seg: 30 });
      b.blob("Honey armor", [0, 0.12, 0.125], [0.18, 0.24, 0.13], torsoSkin, { seg: 26 });
      // Fliege
      for (const s of [1, -1]) b.blob("Bow luminous trim", [0.045 * s, 0.47, 0.17], [0.045, 0.03, 0.02], "Chest", { rot: [0, 0, 0.25 * s] });
      b.blob("Bow luminous trim", [0, 0.47, 0.18], [0.018, 0.018, 0.018], "Chest");
      arms(b, J, "Plush stage suit", { upper: [0.085, 0.075], lower: [0.075, 0.068], shoulder: 0.09 });
      hands(b, J, "Honey armor", { r: [0.065, 0.075, 0.055], drop: 0.04 });
      legs(b, J, "Plush stage suit", { upper: [0.115, 0.1], lower: [0.1, 0.09] });
      feet(b, J, "Honey armor", { r: [0.095, 0.065, 0.14], forward: 0.04, exp: 0.9 });
    },
  },

  "retro-bot": {
    base: "atlas-prism",
    title: "Retro Bot",
    materials: {
      "Tin stage suit": { color: "#8f9aa6", metal: 0.65, rough: 0.35 },
      "Copper armor": { color: "#c27a46", metal: 0.6, rough: 0.4 },
      "Screen glass": { color: "#06100f", metal: 0.3, rough: 0.15 },
      "LED display": { color: "#b7ff3c", emissive: 1 },
      "Dial luminous trim": { color: "#ff9b2e", emissive: 0.8 },
      "Dark joint": { color: "#2a2d33", metal: 0.4, rough: 0.5 },
    },
    shift: {
      ...Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`FaceLedBar${i}`, [0, 0.01, 0.022]])),
      FaceLedEyeLeft: [0.0, 0.0, 0.022],
      FaceLedEyeRight: [0.0, 0.0, 0.022],
      ChromeAntenna: [0, 0.02, 0],
    },
    body(b, J, F) {
      // Fernseher-Kopf mit Bildschirm, Ohrenschrauben, Antenne
      b.blob("Tin stage suit", [0, 0.74, 0], [0.19, 0.165, 0.155], "Head", { exp: 0.22, seg: 28 });
      b.blob("Screen glass", [0, 0.725, 0.152], [0.145, 0.115, 0.012], "Head", { exp: 0.25, seg: 24 });
      ledFace(b, F, { bar: [0.009, 0.032, 0.005], eye: [0.028, 0.02, 0.005] });
      for (const s of [1, -1]) b.tube("Copper armor", [[0.19 * s, 0.74, 0], [0.23 * s, 0.74, 0]], 0.04, "Head", { seg: 16 });
      const a = F.ChromeAntenna;
      b.tube("Dark joint", [[0, 0.89, 0], vec.add(a, [0, 0.1, 0])], 0.009, "ChromeAntenna", { seg: 8 });
      b.blob("Dial luminous trim", vec.add(a, [0, 0.12, 0]), [0.03, 0.03, 0.03], "ChromeAntenna");
      // Kasten-Rumpf mit Kupfer-Brustplatte und Leuchtknöpfen, Becken
      b.blob("Tin stage suit", [0, 0.25, 0], [0.24, 0.22, 0.16], torsoSkin, { exp: 0.25, seg: 28 });
      b.blob("Copper armor", [0, 0.27, 0.15], [0.15, 0.13, 0.02], "Chest", { exp: 0.3 });
      for (const [x, y] of [[-0.07, 0.3], [0, 0.3], [0.07, 0.3], [-0.04, 0.22], [0.04, 0.22]])
        b.blob("Dial luminous trim", [x, y, 0.172], [0.018, 0.018, 0.01], "Chest");
      b.tube("Dark joint", [[0, -0.02, 0], [0, 0.06, 0]], [0.12, 0.09], torsoSkin, { seg: 18, caps: false, up: [0, 0, 1] });
      b.blob("Tin stage suit", [0, -0.06, 0], [0.18, 0.08, 0.13], "Hips", { exp: 0.3 });
      // Arme: Rohre mit Gelenkkugeln, Zangenhände
      for (const [side] of [L, R]) {
        b.blob("Copper armor", J[`${side}Arm`], [0.06, 0.06, 0.06], `${side}Arm`);
        b.blob("Dark joint", J[`${side}ForeArm`], [0.045, 0.045, 0.045], () => [[`${side}Arm`, 0.5], [`${side}ForeArm`, 0.5]]);
      }
      arms(b, J, "Tin stage suit", { upper: [0.042, 0.04], lower: [0.04, 0.038], shoulder: 0.001 });
      hands(b, J, "Copper armor", { r: [0.04, 0.06, 0.045], drop: 0.045 });
      for (const [side] of [L, R]) {
        b.blob("Dark joint", J[`${side}Leg`], [0.055, 0.055, 0.055], () => [[`${side}UpLeg`, 0.5], [`${side}Leg`, 0.5]]);
      }
      legs(b, J, "Tin stage suit", { upper: [0.055, 0.05], lower: [0.05, 0.048] });
      feet(b, J, "Copper armor", { r: [0.085, 0.055, 0.135], forward: 0.045, exp: 0.25 });
    },
  },

  "astro-nova": {
    base: "atlas-prism",
    title: "Astro Nova",
    materials: {
      "Astro stage suit": { color: "#e9ebf0", rough: 0.6 },
      "Helmet armor": { color: "#f7f8fb", metal: 0.2, rough: 0.3 },
      "Gold visor": { color: "#2a1d08", metal: 0.95, rough: 0.12 },
      "LED display": { color: "#7ef0ff", emissive: 1 },
      "Mission luminous trim": { color: "#ff7a1a", emissive: 0.5 },
      "Dark joint": { color: "#3a3f4a", rough: 0.6 },
    },
    shift: {
      ...Object.fromEntries([0, 1, 2, 3, 4].map((i) => [`FaceLedBar${i}`, [0, 0.0, 0.078]])),
      FaceLedEyeLeft: [0.005, -0.01, 0.07],
      FaceLedEyeRight: [-0.005, -0.01, 0.07],
    },
    body(b, J, F) {
      // Helm mit Visier, Ring am Hals, Rucksack
      b.blob("Helmet armor", [0, 0.74, 0], [0.215, 0.215, 0.215], "Head", { seg: 30 });
      b.blob("Gold visor", [0, 0.725, 0.105], [0.165, 0.125, 0.125], "Head", { seg: 26 });
      ledFace(b, F, { bar: [0.008, 0.026, 0.004], eye: [0.022, 0.022, 0.004] });
      b.tube("Mission luminous trim", Array.from({ length: 25 }, (_, i) => {
        const a = (2 * Math.PI * i) / 24;
        return [0.15 * Math.sin(a), 0.535, 0.13 * Math.cos(a)];
      }), 0.025, "Neck", { seg: 10, caps: false });
      b.blob("Astro stage suit", [0, 0.2, 0], [0.26, 0.3, 0.19], torsoSkin, { seg: 28 });
      b.blob("Helmet armor", [0, 0.27, 0.15], [0.12, 0.09, 0.05], "Chest", { exp: 0.35 });
      for (const [x, c] of [[-0.05, "Mission luminous trim"], [0, "LED display"], [0.05, "Mission luminous trim"]])
        b.blob(c, [x, 0.29, 0.2], [0.014, 0.014, 0.008], "Chest");
      b.blob("Helmet armor", [0, 0.24, -0.2], [0.18, 0.21, 0.09], "Chest", { exp: 0.3 });
      // dicke Ärmel und Hosen mit orangen Streifen, Handschuhe, Stiefel
      arms(b, J, "Astro stage suit", { upper: [0.085, 0.075], lower: [0.072, 0.066], shoulder: 0.09 });
      for (const [side] of [L, R]) {
        const fa = J[`${side}ForeArm`];
        const h = J[`${side}Hand`];
        b.limb("Mission luminous trim", vec.lerp(fa, h, 0.55), vec.lerp(fa, h, 0.65), 0.073, 0.072, `${side}ForeArm`, null, { caps: false, steps: 1 });
      }
      hands(b, J, "Helmet armor", { r: [0.06, 0.07, 0.055], drop: 0.04 });
      legs(b, J, "Astro stage suit", { upper: [0.11, 0.095], lower: [0.092, 0.085] });
      for (const [side] of [L, R]) {
        const k = J[`${side}Leg`];
        const f = J[`${side}Foot`];
        b.limb("Mission luminous trim", vec.lerp(k, f, 0.3), vec.lerp(k, f, 0.38), 0.094, 0.093, `${side}Leg`, null, { caps: false, steps: 1 });
      }
      feet(b, J, "Helmet armor", { r: [0.095, 0.075, 0.15], forward: 0.04, exp: 0.5 });
    },
  },

  "kosmo-alien": {
    base: "rio-carnival",
    title: "Kosmo Alien",
    materials: {
      "Alien stage suit": { color: "#62d36a", rough: 0.45 },
      "Silver armor": { color: "#c9ced8", metal: 0.75, rough: 0.3 },
      "Antenna luminous trim": { color: "#d6ff3a", emissive: 0.9 },
      Ink: { color: "#05060a", rough: 0.08, metal: 0.2 },
      "Eye sparkle": { color: "#ffffff", emissive: 0.9 },
    },
    shift: {
      FaceEyeLeft: [0.028, 0.03, 0.06],
      FaceEyeRight: [-0.028, 0.03, 0.06],
      FaceBrowLeft: [0.03, 0.06, 0.05],
      FaceBrowRight: [-0.03, 0.06, 0.05],
      FaceSmile: [0, -0.01, 0.045],
    },
    body(b, J, F) {
      // Eierkopf, riesige schräge Augen, Fühler
      b.blob("Alien stage suit", [0, 0.79, 0], [0.19, 0.245, 0.18], "Head", { seg: 30 });
      for (const [side, s] of [L, R]) {
        const e = F[`FaceEye${side}`];
        b.blob("Ink", e, [0.05, 0.072, 0.03], `FaceEye${side}`, { rot: [0, 0.35 * s, -0.5 * s] });
        b.blob("Eye sparkle", vec.add(e, [0.012 * s, 0.03, 0.022]), [0.012, 0.012, 0.008], `FaceEye${side}`);
        b.tube("Alien stage suit", [[0.05 * s, 0.98, 0], [0.09 * s, 1.07, -0.02], [0.13 * s, 1.12, -0.01]], 0.012, "Head", { seg: 8 });
        b.blob("Antenna luminous trim", [0.135 * s, 1.135, -0.01], [0.032, 0.032, 0.032], "Head");
      }
      b.arc("Ink", F.FaceSmile, 0.03, 0.012, 0.006, "FaceSmile");
      // dünner Hals, Silber-Overall mit Leuchtgürtel
      b.limb("Alien stage suit", [0, 0.45, 0], [0, 0.6, 0], 0.05, 0.045, "Neck", "Head", { caps: false });
      b.blob("Silver armor", [0, 0.2, 0], [0.2, 0.3, 0.15], torsoSkin, { seg: 28 });
      b.blob("Silver armor", [0, 0.42, 0], [0.25, 0.06, 0.15], "Chest", { exp: [1, 0.6] });
      b.tube("Antenna luminous trim", Array.from({ length: 25 }, (_, i) => {
        const a = (2 * Math.PI * i) / 24;
        return [0.2 * Math.sin(a), 0.0, 0.15 * Math.cos(a)];
      }), 0.018, torsoSkin, { seg: 8, caps: false });
      arms(b, J, "Alien stage suit", { upper: [0.04, 0.036], lower: [0.036, 0.032], shoulder: 0.05 });
      for (const [side] of [L, R]) b.limb("Silver armor", J[`${side}Arm`], vec.lerp(J[`${side}Arm`], J[`${side}ForeArm`], 0.5), 0.055, 0.048, `${side}Arm`, null, { caps: true });
      // lange Finger: drei dünne Röhren je Hand
      for (const [side, s] of [L, R]) {
        const h = J[`${side}Hand`];
        b.blob("Alien stage suit", vec.add(h, [0, -0.03, 0]), [0.04, 0.05, 0.03], `${side}Hand`);
        for (const dx of [-0.022, 0, 0.022])
          b.tube("Alien stage suit", [vec.add(h, [dx * s, -0.06, 0.005]), vec.add(h, [dx * 1.3 * s, -0.12, 0.012])], 0.009, `${side}Hand`, { seg: 6 });
      }
      legs(b, J, "Silver armor", { upper: [0.07, 0.058], lower: [0.055, 0.048] });
      feet(b, J, "Alien stage suit", { r: [0.065, 0.05, 0.12], forward: 0.05, exp: 0.9 });
    },
  },

  "punk-rocker": {
    base: "rio-carnival",
    title: "Punk Rocker",
    materials: {
      "Leather stage suit": { color: "#1b1b1f", metal: 0.15, rough: 0.35 },
      "Denim armor": { color: "#2f4f86", rough: 0.85 },
      Skin: { color: "#e2b08f", rough: 0.7 },
      "Mohawk luminous trim": { color: "#ff2e63", emissive: 0.35 },
      Studs: { color: "#d8dde6", metal: 0.95, rough: 0.2 },
      Ink: { color: "#161214", rough: 0.3 },
      "Eye sparkle": { color: "#ffffff", emissive: 0.8 },
      Boots: { color: "#26201e", rough: 0.5 },
    },
    shift: {
      FaceEyeLeft: [0, 0, 0.035],
      FaceEyeRight: [0, 0, 0.035],
      FaceBrowLeft: [0, -0.005, 0.035],
      FaceBrowRight: [0, -0.005, 0.035],
      FaceSmile: [0, 0, 0.035],
    },
    body(b, J, F) {
      // Kopf mit Irokesenkamm aus Stacheln
      b.blob("Skin", [0, 0.74, 0], [0.165, 0.2, 0.165], "Head", { seg: 28 });
      for (const s of [1, -1]) b.blob("Skin", [0.165 * s, 0.73, 0], [0.025, 0.04, 0.02], "Head");
      comicFace(b, F, { eye: [0.02, 0.026, 0.01], smile: [0.04, 0.012, 0.007] });
      for (let i = 0; i < 7; i++) {
        const a = -0.95 + (1.9 * i) / 6;
        const base = [0, 0.74 + 0.19 * Math.cos(a), 0.19 * Math.sin(a)];
        const tip = vec.add(base, vec.mul([0, Math.cos(a), Math.sin(a)], 0.13 + 0.03 * Math.cos(a)));
        b.cone("Mohawk luminous trim", base, tip, 0.04, "Head");
      }
      b.limb("Skin", [0, 0.45, 0], [0, 0.6, 0], 0.06, 0.055, "Neck", "Head", { caps: false });
      // Lederjacke (offen, Kragen), Shirt, Nieten, Jeans, Stiefel
      b.blob("Leather stage suit", [0, 0.22, 0], [0.235, 0.28, 0.17], torsoSkin, { seg: 28 });
      b.blob("Skin", [0, 0.3, 0.145], [0.06, 0.11, 0.03], "Chest");
      b.blob("Mohawk luminous trim", [0, 0.24, 0.16], [0.035, 0.035, 0.012], "Chest", { exp: 0.5 });
      for (const s of [1, -1]) b.blob("Leather stage suit", [0.09 * s, 0.43, 0.08], [0.07, 0.05, 0.04], "Chest", { rot: [0.3, 0, 0.5 * s] });
      for (const [side, s] of [L, R]) {
        const sh = J[`${side}Arm`];
        for (let k = 0; k < 4; k++) b.blob("Studs", vec.add(sh, [0.02 * s, 0.05, -0.03 + 0.02 * k]), [0.012, 0.012, 0.012], `${side}Arm`);
      }
      b.blob("Studs", [0, -0.03, 0.15], [0.03, 0.025, 0.012], "Hips", { exp: 0.4 });
      b.blob("Denim armor", [0, -0.05, 0], [0.19, 0.1, 0.14], "Hips");
      arms(b, J, "Leather stage suit", { upper: [0.06, 0.055], lower: [0.052, 0.046], shoulder: 0.07 });
      hands(b, J, "Skin", { r: [0.04, 0.055, 0.035], drop: 0.045 });
      legs(b, J, "Denim armor", { upper: [0.075, 0.065], lower: [0.062, 0.058] });
      feet(b, J, "Boots", { r: [0.08, 0.075, 0.13], forward: 0.035, exp: 0.6 });
    },
  },

  "glitzer-diva": {
    base: "rio-carnival",
    title: "Glitzer Diva",
    materials: {
      "Sequin stage suit": { color: "#c0267a", metal: 0.7, rough: 0.25 },
      "Afro armor": { color: "#2a1a14", rough: 0.95 },
      Skin: { color: "#8a5a3c", rough: 0.6 },
      "Gem luminous trim": { color: "#ffe066", emissive: 0.7 },
      Ink: { color: "#140c10", rough: 0.3 },
      "Eye sparkle": { color: "#ffffff", emissive: 0.8 },
      Heels: { color: "#f1d27a", metal: 0.8, rough: 0.25 },
    },
    shift: {
      FaceEyeLeft: [0, 0, 0.03],
      FaceEyeRight: [0, 0, 0.03],
      FaceBrowLeft: [0, 0, 0.028],
      FaceBrowRight: [0, 0, 0.028],
      FaceSmile: [0, 0.005, 0.03],
    },
    body(b, J, F) {
      // großer Afro, Ohrringe
      b.blob("Skin", [0, 0.73, 0], [0.15, 0.18, 0.155], "Head", { seg: 28 });
      b.blob("Afro armor", [0, 0.87, -0.09], [0.27, 0.22, 0.21], "Head", { seg: 30 });
      comicFace(b, F, { eye: [0.021, 0.028, 0.01], smile: [0.035, 0.014, 0.007] });
      for (const s of [1, -1]) b.blob("Gem luminous trim", [0.15 * s, 0.64, 0.01], [0.022, 0.022, 0.022], "Head");
      b.limb("Skin", [0, 0.45, 0], [0, 0.6, 0], 0.05, 0.047, "Neck", "Head", { caps: false });
      // Pailletten-Kleid: schmales Oberteil, ausgestellter Rock bis übers Knie – der Rock folgt den Beinen
      b.blob("Sequin stage suit", [0, 0.25, 0], [0.18, 0.24, 0.135], torsoSkin, { seg: 28 });
      b.blob("Skin", [0, 0.45, 0.04], [0.15, 0.05, 0.1], "Chest");
      for (const s of [1, -1]) b.blob("Gem luminous trim", [0.08 * s, 0.33, 0.12], [0.02, 0.02, 0.012], "Chest");
      const dressSkin = (p) => {
        const down = smoothstep(0.02, -0.5, p[1]);
        const side = p[0] >= 0 ? "LeftUpLeg" : "RightUpLeg";
        // weich zur Seite hin (vorne/hinten in der Mitte bleibt der Rock am Becken), höchstens zur Hälfte am Bein
        const w = 0.5 * down * smoothstep(0, 0.3, Math.abs(p[0]));
        return w > 0.001 ? [["Hips", 1 - w], [side, w]] : [["Hips", 1]];
      };
      b.tube(
        "Sequin stage suit",
        Array.from({ length: 9 }, (_, i) => [0, 0.06 - (0.6 * i) / 8, 0]),
        (t) => [0.17 + 0.16 * t, 0.14 + 0.12 * t],
        dressSkin,
        { seg: 28, caps: false, up: [0, 0, 1] },
      );
      b.tube("Gem luminous trim", Array.from({ length: 29 }, (_, i) => {
        const a = (2 * Math.PI * i) / 28;
        return [0.33 * Math.sin(a), -0.54, 0.26 * Math.cos(a)];
      }), 0.012, dressSkin, { seg: 6, caps: false });
      arms(b, J, "Skin", { upper: [0.045, 0.04], lower: [0.04, 0.035], shoulder: 0.052 });
      for (const [side] of [L, R]) {
        const h = J[`${side}Hand`];
        const fa = J[`${side}ForeArm`];
        b.limb("Gem luminous trim", vec.lerp(fa, h, 0.75), vec.lerp(fa, h, 0.85), 0.042, 0.041, `${side}ForeArm`, null, { caps: false, steps: 1 });
      }
      hands(b, J, "Skin", { r: [0.032, 0.05, 0.03], drop: 0.045 });
      legs(b, J, "Skin", { upper: [0.06, 0.05], lower: [0.045, 0.038] });
      feet(b, J, "Heels", { r: [0.05, 0.05, 0.11], forward: 0.04, exp: 0.7 });
    },
  },
};

export default figuren;
