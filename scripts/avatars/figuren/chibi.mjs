// Chibi-Runde: großer Kopf, große Anime-Augen, kurze Glieder – Hoodies mit Tierohren, Zöpfe, Röcke, klobige Schuhe
import { vec } from "../geometry.mjs";
import { L, R, ring, skirt } from "../parts.mjs";
import {
  animalEars,
  CHIBI,
  chibiBody,
  chibiHead,
  chibiMaterials,
  chibiShift,
  chunkyShoes,
  hairCap,
  hood,
  sideLocks,
  socks,
  twinTails,
} from "../chibi.mjs";

/** Gemeinsame Grunddaten jeder Chibi-Figur */
const chibi = (title, iris, materials, body, base = "aurora-synth") => ({
  base,
  title,
  proportions: CHIBI,
  materials: { ...chibiMaterials(iris), ...materials },
  shift: (J) => chibiShift(J),
  body,
});

/** Schwanz vom Becken nach hinten (Katze, Fuchs, Tiger) */
function tail(b, mat, J, { curl = 1, size = 0.035, tip } = {}) {
  const h = J.Hips;
  const pts = [vec.add(h, [0, -0.04, -0.12]), vec.add(h, [0.06 * curl, -0.02, -0.26]), vec.add(h, [0.14 * curl, 0.12, -0.3]), vec.add(h, [0.12 * curl, 0.26, -0.26])];
  b.tube(mat, pts, (t) => size * (1 + 0.6 * Math.sin(t * Math.PI)), "Hips", { seg: 12 });
  if (tip) b.blob(tip, pts.at(-1), [size * 1.3, size * 1.3, size * 1.3], "Hips");
}

/** Rock um die Hüfte (relativ zur Hüfthöhe der Chibi-Figur) */
const chibiSkirt = (b, J, mat, opts = {}) =>
  skirt(b, mat, { top: J.Hips[1] + 0.07, bottom: J.Hips[1] - 0.2, r0: [0.15, 0.12], r1: [0.24, 0.2], ...opts });

const figuren = {
  "chibi-mika": chibi(
    "Chibi Mika",
    "#8a4bff",
    {
      Hair: { color: "#2fc4c4", rough: 0.45 },
      "Jacket stage suit": { color: "#ff7fa8", rough: 0.6 },
      Top: { color: "#ffffff", rough: 0.7 },
      "Denim armor": { color: "#3d6fb0", rough: 0.85 },
      "Sneaker luminous trim": { color: "#e8344e", emissive: 0.2 },
      Sole: { color: "#f4f4f4", rough: 0.6 },
      EarInner: { color: "#ffd9e6", rough: 0.7 },
    },
    (b, J, F) => {
      const head = chibiHead(b, J, F, { mouth: "open" });
      hairCap(b, "Hair", head);
      twinTails(b, "Hair", head, { length: 0.5, size: 0.1 });
      animalEars(b, "Jacket stage suit", "EarInner", head, { kind: "spitz" });
      chibiBody(b, J, { top: "Top", sleeves: "Jacket stage suit", legsMat: "Denim armor" });
      // offene Jacke über dem weißen Top
      for (const s of [1, -1]) b.blob("Jacket stage suit", vec.add(vec.lerp(J.Hips, J.Neck, 0.5), [0.09 * s, 0, 0.0]), [0.11, 0.2, 0.145], "Spine");
      b.blob("Denim armor", vec.add(J.Hips, [0, -0.02, 0]), [0.16, 0.08, 0.13], "Hips");
      tail(b, "Jacket stage suit", J, { size: 0.03 });
      chunkyShoes(b, J, "Sneaker luminous trim", "Sole");
    },
  ),

  "chibi-fuchsi": chibi(
    "Chibi Fuchsi",
    "#c2412b",
    {
      Hair: { color: "#7a4a2e", rough: 0.6 },
      "Hoodie stage suit": { color: "#f28a2e", rough: 0.7 },
      "Fur armor": { color: "#fff6ea", rough: 0.85 },
      Shoes: { color: "#e07a2a", rough: 0.5 },
      "String luminous trim": { color: "#ffffff", emissive: 0.15 },
    },
    (b, J, F) => {
      const head = chibiHead(b, J, F, { mouth: "open", ears: false });
      hairCap(b, "Hair", head, { fringe: 6 });
      sideLocks(b, "Hair", head, { length: 0.3 });
      hood(b, "Hoodie stage suit", head);
      animalEars(b, "Hoodie stage suit", "Fur armor", head, { kind: "spitz", lift: 0.03 });
      // Hoodie-Kleid bis über die Knie, Bändchen, Fuchsschwanz mit weißer Spitze
      chibiBody(b, J, { top: "Hoodie stage suit", chest: [0.19, 0.22, 0.16] });
      chibiSkirt(b, J, "Hoodie stage suit", { r1: [0.21, 0.18], bottom: J.Hips[1] - 0.16 });
      for (const s of [1, -1]) b.tube("String luminous trim", [vec.add(J.Neck, [0.04 * s, 0.0, 0.14]), vec.add(J.Neck, [0.045 * s, -0.12, 0.16])], 0.007, "Chest", { seg: 6 });
      tail(b, "Hoodie stage suit", J, { size: 0.06, tip: "Fur armor" });
      chunkyShoes(b, J, "Shoes", null, { r: [0.065, 0.05, 0.1] });
    },
  ),

  "chibi-hana": chibi(
    "Chibi Hana",
    "#d94a7a",
    {
      Hair: { color: "#ff8fb6", rough: 0.5 },
      "Beanie armor": { color: "#ffffff", rough: 0.9 },
      Pompom: { color: "#ff9ac0", rough: 0.9 },
      "Jacket stage suit": { color: "#f4f2f8", rough: 0.7 },
      Skirt: { color: "#c9c7d6", rough: 0.75 },
      "Ribbon luminous trim": { color: "#ff5c8a", emissive: 0.2 },
      Stripes: { color: "#2a2230", rough: 0.7 },
      Socks: { color: "#ffffff", rough: 0.8 },
      Boots: { color: "#4a3040", rough: 0.5 },
    },
    (b, J, F) => {
      const head = chibiHead(b, J, F);
      hairCap(b, "Hair", head, { volume: 1.1 });
      // lange, wellige Haare (mehrere Locken hinten und seitlich)
      for (let k = 0; k < 7; k++) {
        const a = -1.3 + (2.6 * k) / 6;
        const top = vec.add(head.c, [head.r[0] * Math.sin(a), 0.0, head.r[2] * 0.6 * Math.cos(a) - 0.1]);
        b.tube("Hair", [top, vec.add(top, [0.03 * Math.sin(a), -0.2, -0.03]), vec.add(top, [-0.02 * Math.sin(a), -0.42, -0.02])], (t) => 0.075 * (1 - 0.4 * t), "Head", { seg: 10 });
      }
      // Mütze mit zwei Bommel-Ohren
      b.blob("Beanie armor", vec.add(head.c, [0, 0.14, -0.02]), [head.r[0] * 1.04, head.r[1] * 0.62, head.r[2] * 1.04], "Head", { seg: 28 });
      ring(b, "Beanie armor", vec.add(head.c, [0, 0.07, -0.02]), head.r[0] * 1.05, head.r[2] * 1.05, 0.03, "Head");
      animalEars(b, "Pompom", null, head, { kind: "rund", spread: 0.7, lift: 0.02 });
      chibiBody(b, J, { top: "Jacket stage suit" });
      b.blob("Ribbon luminous trim", vec.add(J.Neck, [0, -0.04, 0.14]), [0.035, 0.022, 0.015], "Chest");
      chibiSkirt(b, J, "Skirt");
      socks(b, J, "Socks", { height: 0.75, stripes: "Stripes" });
      chunkyShoes(b, J, "Boots", null);
    },
  ),

  "chibi-momo": chibi(
    "Chibi Momo",
    "#2fb36b",
    {
      Hair: { color: "#c8673a", rough: 0.6 },
      "Bunny stage suit": { color: "#ff9cc2", rough: 0.75 },
      EarInner: { color: "#cfe8ff", rough: 0.7 },
      "Heart luminous trim": { color: "#ff3d7f", emissive: 0.4 },
      Shoes: { color: "#ff7aa8", rough: 0.5 },
    },
    (b, J, F) => {
      const head = chibiHead(b, J, F, { ears: false });
      hairCap(b, "Hair", head, { fringe: 6 });
      sideLocks(b, "Hair", head, { length: 0.22 });
      hood(b, "Bunny stage suit", head);
      animalEars(b, "Bunny stage suit", "EarInner", head, { kind: "lang", spread: 0.45, lift: 0.04 });
      chibiBody(b, J, { top: "Bunny stage suit", chest: [0.19, 0.22, 0.16] });
      chibiSkirt(b, J, "Bunny stage suit", { r1: [0.22, 0.19] });
      for (const y of [0.0, -0.09]) b.blob("Heart luminous trim", vec.add(vec.lerp(J.Hips, J.Neck, 0.55), [0, y, 0.165]), [0.025, 0.022, 0.01], "Spine");
      chunkyShoes(b, J, "Shoes", null, { r: [0.065, 0.05, 0.1] });
    },
  ),

  "chibi-rin": chibi(
    "Chibi Rin",
    "#3a3a44",
    {
      Hair: { color: "#7bea3c", rough: 0.5 },
      "Crop stage suit": { color: "#16161a", rough: 0.6 },
      "Cargo armor": { color: "#5a5d62", rough: 0.85 },
      Boots: { color: "#141416", rough: 0.4 },
      "Hoop luminous trim": { color: "#d9dde4", metal: 0.9, rough: 0.2 },
      Belt: { color: "#22222a", rough: 0.5 },
    },
    (b, J, F) => {
      const head = chibiHead(b, J, F);
      hairCap(b, "Hair", head, { fringe: 7, fringeLen: 0.12 });
      // zwei Haarknoten oben mit langen Flechtzöpfen
      for (const s of [1, -1]) {
        const bun = vec.add(head.c, [0.22 * s, 0.24, -0.05]);
        b.blob("Hair", bun, [0.09, 0.09, 0.09], "Head");
        for (let k = 0; k < 6; k++) b.blob("Hair", vec.add(head.c, [0.29 * s, -0.08 - k * 0.075, -0.06]), [0.045, 0.045, 0.045], "Head", { seg: 12 });
      }
      b.blob("Hoop luminous trim", onCheek(head, 1), [0.022, 0.022, 0.022], "Head");
      // bauchfreies Top: Haut unten, schwarzes Top oben an der Brust
      chibiBody(b, J, { top: "Skin", sleeves: "Skin", legsMat: "Cargo armor" });
      b.blob("Crop stage suit", vec.add(vec.lerp(J.Hips, J.Neck, 0.68), [0, 0, 0]), [0.175, 0.11, 0.145], "Chest", { seg: 24 });
      b.blob("Cargo armor", vec.add(J.Hips, [0, -0.02, 0]), [0.17, 0.09, 0.14], "Hips");
      ring(b, "Belt", vec.add(J.Hips, [0, 0.05, 0]), 0.17, 0.14, 0.018, "Hips");
      for (const [side, s] of [L, R]) b.blob("Cargo armor", vec.add(vec.lerp(J[`${side}UpLeg`], J[`${side}Leg`], 0.55), [0.06 * s, 0, 0]), [0.03, 0.05, 0.045], `${side}UpLeg`);
      socks(b, J, "Boots", { height: 0.7, radius: 0.066 });
      chunkyShoes(b, J, "Boots", "Belt", { r: [0.078, 0.065, 0.12] });
    },
  ),

  "chibi-sora": chibi(
    "Chibi Sora",
    "#2f8fe0",
    {
      Hair: { color: "#2a4fc9", rough: 0.4 },
      "Headband luminous trim": { color: "#e8223f", emissive: 0.25 },
      "Uniform stage suit": { color: "#ffffff", rough: 0.75 },
      "Collar armor": { color: "#27407a", rough: 0.7 },
      Scarf: { color: "#e8223f", rough: 0.6 },
      Skirt: { color: "#27407a", rough: 0.75 },
      Socks: { color: "#ffffff", rough: 0.8 },
      Loafers: { color: "#6b3a22", rough: 0.4 },
    },
    (b, J, F) => {
      const head = chibiHead(b, J, F);
      hairCap(b, "Hair", head, { fringe: 6 });
      sideLocks(b, "Hair", head, { length: 0.26, width: 0.08 });
      b.blob("Hair", vec.add(head.c, [0, -0.05, -0.12]), [head.r[0] * 1.05, head.r[1] * 0.85, head.r[2] * 0.8], "Head", { seg: 24 });
      ring(b, "Headband luminous trim", vec.add(head.c, [0, 0.2, -0.04]), head.r[0] * 0.98, head.r[2] * 0.9, 0.018, "Head");
      // Matrosenkragen, rotes Halstuch, Faltenrock, Kniestrümpfe, Loafer
      chibiBody(b, J, { top: "Uniform stage suit" });
      b.blob("Collar armor", vec.add(J.Neck, [0, -0.05, -0.04]), [0.2, 0.08, 0.15], "Chest", { exp: [1, 0.5] });
      b.cone("Scarf", vec.add(J.Neck, [0, -0.05, 0.15]), vec.add(J.Neck, [0, -0.16, 0.17]), 0.05, "Chest");
      chibiSkirt(b, J, "Skirt");
      socks(b, J, "Socks", { height: 0.85 });
      chunkyShoes(b, J, "Loafers", null, { r: [0.064, 0.045, 0.105] });
    },
  ),

  "chibi-tora": chibi(
    "Chibi Tora",
    "#8a5a2b",
    {
      Hair: { color: "#a8744a", rough: 0.6 },
      "Tiger stage suit": { color: "#f5a524", rough: 0.75 },
      "Stripe armor": { color: "#2a1d16", rough: 0.75 },
      EarInner: { color: "#fff2dc", rough: 0.8 },
      Shorts: { color: "#2a2a30", rough: 0.7 },
      Stockings: { color: "#3a2e2a", rough: 0.7 },
    },
    (b, J, F) => {
      const head = chibiHead(b, J, F, { ears: false });
      hairCap(b, "Hair", head, { fringe: 6 });
      sideLocks(b, "Hair", head, { length: 0.28 });
      hood(b, "Tiger stage suit", head);
      animalEars(b, "Tiger stage suit", "EarInner", head, { kind: "rund", spread: 0.72, lift: 0.04 });
      // Tigerstreifen auf der Kapuze
      for (const s of [1, -1, 0]) b.blob("Stripe armor", vec.add(head.c, [0.12 * s, 0.33 - Math.abs(s) * 0.04, -0.02]), [0.02, 0.06, 0.05], "Head", { rot: [0, 0, 0.3 * s] });
      chibiBody(b, J, { top: "Tiger stage suit", legsMat: "Stockings", chest: [0.19, 0.22, 0.16] });
      for (let k = 0; k < 3; k++)
        for (const s of [1, -1]) b.blob("Stripe armor", vec.add(vec.lerp(J.Hips, J.Neck, 0.3 + k * 0.2), [0.16 * s, 0, 0.04]), [0.015, 0.025, 0.06], "Spine");
      b.blob("Shorts", vec.add(J.Hips, [0, -0.03, 0]), [0.16, 0.08, 0.13], "Hips");
      tail(b, "Tiger stage suit", J, { size: 0.035, curl: -1, tip: "Stripe armor" });
      chunkyShoes(b, J, "Tiger stage suit", "Stripe armor", { r: [0.07, 0.055, 0.11] });
    },
  ),

  "chibi-kai": chibi(
    "Chibi Kai",
    "#2f6fd0",
    {
      Hair: { color: "#ff9d1c", rough: 0.45 },
      "Coat stage suit": { color: "#4f9ddb", rough: 0.6 },
      Shirt: { color: "#ffb52e", rough: 0.7 },
      Pants: { color: "#1c1c22", rough: 0.7 },
      "Collar luminous trim": { color: "#1f4fa8", emissive: 0.15 },
      Shoes: { color: "#2a2a30", rough: 0.5 },
    },
    (b, J, F) => {
      const head = chibiHead(b, J, F, { lashes: false });
      hairCap(b, "Hair", head, { fringe: 5, fringeLen: 0.12 });
      // Stachelhaare
      for (let k = 0; k < 9; k++) {
        const a = -1.4 + (2.8 * k) / 8;
        const base = vec.add(head.c, [head.r[0] * 0.8 * Math.sin(a), head.r[1] * 0.75 * Math.cos(a) * 0.9 + 0.04, -0.08]);
        b.cone("Hair", base, vec.add(base, [0.17 * Math.sin(a), 0.13 * Math.cos(a) + 0.04, -0.06]), 0.07, "Head");
      }
      chibiBody(b, J, { top: "Shirt", sleeves: "Coat stage suit", legsMat: "Pants" });
      // langer, offener Mantel mit hohem Kragen
      for (const s of [1, -1]) b.blob("Coat stage suit", vec.add(vec.lerp(J.Hips, J.Neck, 0.4), [0.1 * s, 0, 0]), [0.11, 0.3, 0.15], torsoSkinOf(J), { seg: 20 });
      b.blob("Collar luminous trim", vec.add(J.Neck, [0, 0.01, -0.03]), [0.15, 0.06, 0.13], "Chest", { exp: [1, 0.6] });
      chunkyShoes(b, J, "Shoes", null);
    },
  ),

  "chibi-leo": chibi(
    "Chibi Leo",
    "#3a5a8a",
    {
      Hair: { color: "#b8592b", rough: 0.55 },
      Shirt: { color: "#fbf6ec", rough: 0.75 },
      "Vest stage suit": { color: "#d9542a", rough: 0.75 },
      "Argyle armor": { color: "#f2b14a", rough: 0.75 },
      Pants: { color: "#3f8a99", rough: 0.75 },
      Shoes: { color: "#3a2430", rough: 0.4 },
    },
    (b, J, F) => {
      const head = chibiHead(b, J, F, { lashes: false, mouth: "open" });
      hairCap(b, "Hair", head, { fringe: 5, fringeLen: 0.09, volume: 1.08 });
      b.blob("Hair", vec.add(head.c, [0.06, 0.3, 0.12]), [0.12, 0.06, 0.1], "Head", { rot: [0.4, 0, -0.3] });
      chibiBody(b, J, { top: "Vest stage suit", sleeves: "Shirt", legsMat: "Pants" });
      for (let k = 0; k < 2; k++)
        for (const x of [-0.06, 0.06]) b.blob("Argyle armor", vec.add(vec.lerp(J.Hips, J.Neck, 0.35 + k * 0.25), [x, 0, 0.15]), [0.03, 0.04, 0.01], "Spine", { rot: [0, 0, Math.PI / 4] });
      b.cone("Shirt", vec.add(J.Neck, [0, -0.02, 0.13]), vec.add(J.Neck, [0, -0.11, 0.15]), 0.05, "Chest");
      chunkyShoes(b, J, "Shoes", null);
    },
  ),

  "chibi-pixel": chibi(
    "Chibi Pixel",
    "#ff5fa8",
    {
      Hair: { color: "#ffa3cf", rough: 0.45 },
      "Bow luminous trim": { color: "#4fb8ff", emissive: 0.3 },
      "Idol stage suit": { color: "#bfe4ff", rough: 0.4, metal: 0.2 },
      Skirt: { color: "#e8f5ff", rough: 0.5 },
      Boots: { color: "#3a7bd5", rough: 0.4 },
      Laces: { color: "#ffffff", rough: 0.6 },
    },
    (b, J, F) => {
      const head = chibiHead(b, J, F, { mouth: "open" });
      hairCap(b, "Hair", head, { fringe: 7, fringeLen: 0.11 });
      twinTails(b, "Hair", head, { length: 0.42, size: 0.11, tie: "Bow luminous trim" });
      for (const s of [1, -1]) {
        const at = [head.r[0] * 0.85 * s, head.c[1] + head.r[1] * 0.45, head.c[2] - 0.08];
        b.blob("Bow luminous trim", vec.add(at, [0.05 * s, 0.03, 0.02]), [0.06, 0.03, 0.02], "Head", { rot: [0, 0, 0.4 * s] });
      }
      // Idol-Outfit: glänzendes Oberteil, Volantrock, Schnürstiefel
      chibiBody(b, J, { top: "Idol stage suit" });
      chibiSkirt(b, J, "Skirt", { hem: "Bow luminous trim", hemRadius: 0.01 });
      socks(b, J, "Boots", { height: 0.6, radius: 0.064, stripes: "Laces" });
      chunkyShoes(b, J, "Boots", "Laces");
    },
  ),
};

/** Ohrring rechts am Kopf */
function onCheek(head, s) {
  return [head.r[0] * 0.98 * s, head.c[1] - 0.12, head.c[2] - 0.01];
}

/** Mantel: oben an der Brust, unten am Becken */
function torsoSkinOf(J) {
  return (p) => (p[1] > J.Spine[1] ? [["Chest", 1]] : [["Hips", 1]]);
}

export default figuren;
