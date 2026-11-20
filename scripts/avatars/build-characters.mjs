// Neue Avatare aus Formen bauen: Skelett und alle Tanz-Clips stammen von einem vorhandenen Avatar (gleiche Knochen,
// gleiche Animationen), der Körper wird neu aus abgerundeten Formen erzeugt und an die Knochen gebunden. So entstehen
// ganz andere Figuren (Bär, Roboter, Astronaut, Alien, Punk, Diva), die trotzdem jeden Tanz können.
//
//   node scripts/avatars/build-characters.mjs           → schreibt avatars/<id>.glb und ergänzt avatars/manifest.json
//   node scripts/avatars/build-characters.mjs bär …     → nur diese
//
// Danach: Vorschaubilder (scripts/avatars/render-previews.mjs) und `npm run avatars` (Komprimieren nach /public).
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { Builder, byHeight, smoothstep, vec } from "./geometry.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const dir = path.join(root, "avatars");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const L = ["Left", 1];
const R = ["Right", -1];

// ---------------------------------------------------------------- Körperteile, die mehrere Figuren teilen

/** Rumpf-Gewichte: Becken → Bauch → Brust → Hals */
const torsoSkin = byHeight([
  [0.0, "Hips"],
  [0.16, "Spine"],
  [0.34, "Chest"],
  [0.47, "Chest"],
  [0.56, "Neck"],
]);

function arms(b, J, mat, { upper = [0.07, 0.06], lower = [0.058, 0.05], shoulder = 0.075 } = {}) {
  for (const [side] of [L, R]) {
    const sh = J[`${side}Arm`];
    b.blob(mat, sh, [shoulder, shoulder, shoulder], () => [[`${side}Arm`, 0.7], [`${side}Shoulder`, 0.3]]);
    b.limb(mat, sh, J[`${side}ForeArm`], upper[0], upper[1], `${side}Arm`, `${side}ForeArm`);
    b.limb(mat, J[`${side}ForeArm`], J[`${side}Hand`], lower[0], lower[1], `${side}ForeArm`, `${side}Hand`);
  }
}

/** Fäustlinge/Pfoten an den Händen (Finger bewegen sich mit der Hand) */
function hands(b, J, mat, { r = [0.055, 0.07, 0.045], drop = 0.05, rot } = {}) {
  for (const [side, s] of [L, R]) {
    const h = J[`${side}Hand`];
    b.blob(mat, vec.add(h, [0.008 * s, -drop, 0.004]), r, `${side}Hand`, { rot: rot?.(s) });
  }
}

function legs(b, J, mat, { upper = [0.09, 0.075], lower = [0.072, 0.06] } = {}) {
  for (const [side] of [L, R]) {
    b.limb(mat, J[`${side}UpLeg`], J[`${side}Leg`], upper[0], upper[1], `${side}UpLeg`, `${side}Leg`);
    b.limb(mat, J[`${side}Leg`], J[`${side}Foot`], lower[0], lower[1], `${side}Leg`, `${side}Foot`);
  }
}

/** Schuhe/Füße: von der Ferse nach vorn bis zum Boden (y −1) */
function feet(b, J, mat, { r = [0.075, 0.06, 0.13], forward = 0.05, exp = 0.6 } = {}) {
  for (const [side] of [L, R]) {
    const f = J[`${side}Foot`];
    b.blob(mat, [f[0], -0.94, f[2] + forward], r, `${side}Foot`, { exp: [exp, 0.8] });
  }
}

/** Comic-Augen (schwarz glänzend) mit Lichtpunkt, Brauen und gemaltes Lächeln an den Gesichtsknochen */
function comicFace(b, F, { eye = [0.024, 0.032, 0.012], brow = true, smile = [0.045, 0.02, 0.008], pupil = "Ink" } = {}) {
  for (const [side] of [L, R]) {
    const e = F[`FaceEye${side}`];
    b.blob(pupil, e, eye, `FaceEye${side}`);
    b.blob("Eye sparkle", vec.add(e, [eye[0] * 0.35, eye[1] * 0.35, eye[2] * 0.9]), [eye[0] * 0.3, eye[0] * 0.3, eye[2] * 0.3], `FaceEye${side}`);
    if (brow) b.blob(pupil, F[`FaceBrow${side}`], [0.026, 0.006, 0.006], `FaceBrow${side}`, { rot: [0, 0, side === "Left" ? -0.15 : 0.15] });
  }
  b.arc(pupil, F.FaceSmile, smile[0], smile[1], smile[2], "FaceSmile", { z: 0 });
}

/** LED-Gesicht: 5 Balken (Stimme) und 2 Augen (Takt) an den Gesichtsknochen */
function ledFace(b, F, { bar = [0.009, 0.03, 0.006], eye = [0.026, 0.026, 0.006] } = {}) {
  for (let i = 0; i < 5; i++) b.blob("LED display", F[`FaceLedBar${i}`], bar, `FaceLedBar${i}`, { exp: 0.3, seg: 10 });
  for (const [side] of [L, R]) b.blob("LED display", F[`FaceLedEye${side}`], eye, `FaceLedEye${side}`, { seg: 14 });
}

// ---------------------------------------------------------------- Figuren

/**
 * Jede Figur: Grundmodell (Skelett, Clips, Gesichtsart), Materialien, verschobene Gesichtsknochen (Gesicht auf der
 * neuen Kopfform) und der Körper. Materialnamen mit „stage suit“, „armor“, „luminous trim“ nehmen Outfit- und
 * Künstlerfarben an (lib/avatars/outfits.ts).
 */
const characters = {
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
      b.blob("Afro armor", [0, 0.83, -0.05], [0.27, 0.24, 0.24], "Head", { seg: 30 });
      comicFace(b, F, { eye: [0.021, 0.028, 0.01], smile: [0.035, 0.014, 0.007] });
      for (const s of [1, -1]) b.blob("Gem luminous trim", [0.15 * s, 0.64, 0.01], [0.022, 0.022, 0.022], "Head");
      b.limb("Skin", [0, 0.45, 0], [0, 0.6, 0], 0.05, 0.047, "Neck", "Head", { caps: false });
      // Pailletten-Kleid: schmales Oberteil, ausgestellter Rock bis übers Knie – der Rock folgt den Beinen
      b.blob("Sequin stage suit", [0, 0.25, 0], [0.18, 0.24, 0.135], torsoSkin, { seg: 28 });
      b.blob("Skin", [0, 0.45, 0.04], [0.15, 0.05, 0.1], "Chest");
      for (const s of [1, -1]) b.blob("Gem luminous trim", [0.08 * s, 0.33, 0.12], [0.02, 0.02, 0.012], "Chest");
      const skirtSkin = (p) => {
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
        skirtSkin,
        { seg: 28, caps: false, up: [0, 0, 1] },
      );
      b.tube("Gem luminous trim", Array.from({ length: 29 }, (_, i) => {
        const a = (2 * Math.PI * i) / 28;
        return [0.33 * Math.sin(a), -0.54, 0.26 * Math.cos(a)];
      }), 0.012, skirtSkin, { seg: 6, caps: false });
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

// ---------------------------------------------------------------- Mathe für Matrizen (Spalten-Major wie glTF)

function mat4Mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
const translation = ([x, y, z]) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

/** Glatte Normalen je Material-Gruppe */
function normals(positions, indices) {
  const n = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    const p = (k) => [positions[k * 3], positions[k * 3 + 1], positions[k * 3 + 2]];
    const f = vec.cross(vec.sub(p(b), p(a)), vec.sub(p(c), p(a)));
    for (const k of [a, b, c]) for (let d = 0; d < 3; d++) n[k * 3 + d] += f[d];
  }
  for (let k = 0; k < n.length; k += 3) {
    const l = Math.hypot(n[k], n[k + 1], n[k + 2]) || 1;
    n[k] /= l;
    n[k + 1] /= l;
    n[k + 2] /= l;
  }
  return n;
}

const hex = (h) => [1, 3, 5].map((i) => (parseInt(h.slice(i, i + 2), 16) / 255) ** 2.2);

async function build(id, spec) {
  const doc = await io.read(path.join(dir, `${spec.base}.glb`));
  const r = doc.getRoot();
  const buffer = r.listBuffers()[0];
  const skin = r.listSkins()[0];
  const joints = skin.listJoints();
  const byName = new Map(joints.map((j) => [j.getName(), j]));
  const index = new Map(joints.map((j, i) => [j.getName(), i]));

  // Gesichtsknochen auf die neue Kopfform verschieben: Ruhelage, alle Positions-Schlüssel und die Bind-Matrix
  const ibm = skin.getInverseBindMatrices();
  const ibmArr = Array.from(ibm.getArray());
  for (const [name, delta] of Object.entries(spec.shift ?? {})) {
    const node = byName.get(name);
    if (!node) throw new Error(`${id}: Knochen ${name} fehlt im Grundmodell ${spec.base}`);
    const t = node.getTranslation();
    node.setTranslation([t[0] + delta[0], t[1] + delta[1], t[2] + delta[2]]);
    for (const anim of r.listAnimations())
      for (const ch of anim.listChannels()) {
        if (ch.getTargetNode() !== node || ch.getTargetPath() !== "translation") continue;
        const s = ch.getSampler();
        const out = Array.from(s.getOutput().getArray());
        for (let i = 0; i < out.length; i += 3) for (let d = 0; d < 3; d++) out[i + d] += delta[d];
        // Schlüssel können geteilt sein – eigene Kopie
        s.setOutput(doc.createAccessor().setType("VEC3").setArray(new Float32Array(out)).setBuffer(buffer));
      }
    const k = index.get(name);
    const m = mat4Mul(ibmArr.slice(k * 16, k * 16 + 16), translation(delta.map((v) => -v)));
    ibmArr.splice(k * 16, 16, ...m);
  }
  skin.setInverseBindMatrices(doc.createAccessor().setType("MAT4").setArray(new Float32Array(ibmArr)).setBuffer(buffer));

  // Gelenkpositionen in der Grundhaltung
  const world = (name) => {
    const k = index.get(name);
    const inv = ibmArr.slice(k * 16, k * 16 + 16);
    // Position = −R⁻¹·t aus der inversen Bind-Matrix (Rotation orthonormal)
    const [tx, ty, tz] = [inv[12], inv[13], inv[14]];
    return [
      -(inv[0] * tx + inv[1] * ty + inv[2] * tz),
      -(inv[4] * tx + inv[5] * ty + inv[6] * tz),
      -(inv[8] * tx + inv[9] * ty + inv[10] * tz),
    ];
  };
  const J = Object.fromEntries(joints.map((j) => [j.getName(), world(j.getName())]));

  const b = new Builder();
  spec.body(b, J, J);

  // alten Körper entfernen, neuen anhängen
  const meshNode = r.listNodes().find((n) => n.getMesh() && n.getSkin());
  const old = meshNode.getMesh();
  const mesh = doc.createMesh(`${spec.title} Body`);
  let triangles = 0;
  for (const [matName, g] of b.parts) {
    const def = spec.materials[matName];
    if (!def) throw new Error(`${id}: Material ${matName} nicht definiert`);
    const color = hex(def.color);
    const mat = doc
      .createMaterial(matName)
      .setBaseColorFactor([...color, 1])
      .setMetallicFactor(def.metal ?? 0.1)
      .setRoughnessFactor(def.rough ?? 0.5)
      .setEmissiveFactor(def.emissive ? color.map((c) => Math.min(1, c * def.emissive * 1.6)) : [0, 0, 0]);
    const count = g.positions.length / 3;
    const jArr = new Uint8Array(count * 4);
    const wArr = new Float32Array(count * 4);
    g.skins.forEach((list, v) => {
      const merged = new Map();
      for (const [bone, w] of list) {
        if (!index.has(bone)) throw new Error(`${id}: Knochen ${bone} fehlt`);
        merged.set(bone, (merged.get(bone) ?? 0) + w);
      }
      const top = [...merged].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
      top.forEach(([bone, w], k) => {
        jArr[v * 4 + k] = index.get(bone);
        wArr[v * 4 + k] = w / sum;
      });
    });
    const pos = new Float32Array(g.positions);
    const idx = count > 65535 ? new Uint32Array(g.indices) : new Uint16Array(g.indices);
    triangles += g.indices.length / 3;
    const prim = doc
      .createPrimitive()
      .setMaterial(mat)
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(idx).setBuffer(buffer))
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(pos).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(normals(pos, g.indices)).setBuffer(buffer))
      .setAttribute("JOINTS_0", doc.createAccessor().setType("VEC4").setArray(jArr).setBuffer(buffer))
      .setAttribute("WEIGHTS_0", doc.createAccessor().setType("VEC4").setArray(wArr).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }
  meshNode.setMesh(mesh).setName(`${spec.title} Body`);
  old.dispose();
  const rig = r.listScenes()[0].listChildren()[0];
  rig?.setName(`${spec.title} Rig`);
  await doc.transform(prune());
  const glb = Buffer.from(await io.writeBinary(doc));
  await writeFile(path.join(dir, `${id}.glb`), glb);
  return { glb, triangles, joints: joints.length, clips: r.listAnimations().map((a) => a.getName()) };
}

const manifestPath = path.join(dir, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const wanted = process.argv.slice(2);
for (const [id, spec] of Object.entries(characters)) {
  if (wanted.length && !wanted.includes(id)) continue;
  const { glb, triangles, joints } = await build(id, spec);
  const base = manifest.find((m) => m.file === `${spec.base}.glb`);
  const entry = {
    file: `${id}.glb`,
    motionVersion: base.motionVersion,
    bytes: glb.length,
    sha256: createHash("sha256").update(glb).digest("hex"),
    triangles,
    joints,
    clips: base.clips,
  };
  const at = manifest.findIndex((m) => m.file === entry.file);
  if (at >= 0) manifest[at] = entry;
  else manifest.push(entry);
  console.log(`${id}: ${triangles} Dreiecke, ${(glb.length / 1e6).toFixed(1)} MB`);
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
