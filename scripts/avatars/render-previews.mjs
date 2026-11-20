// Vorschaubilder der Avatare (384×384, transparenter Hintergrund) aus den Quell-GLBs unter /avatars rendern.
//
//   node scripts/avatars/render-previews.mjs disco-baer retro-bot …    → avatars/<id>.png
//   node scripts/avatars/render-previews.mjs --pose Dance_HipHop --out <ordner> …   → Kontrollbilder in einer Tanzpose
//
// Nutzt Playwright mit Chromium (in der CI und im Cloud-Container vorinstalliert) und three aus node_modules.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..", "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const pose = opt("--pose", "Idle_Breathe");
const at = Number(opt("--time", "0.4"));
/** --kopf: Nahaufnahme des Kopfs (Gesicht prüfen) */
const headShot = args.includes("--kopf") ? (args.splice(args.indexOf("--kopf"), 1), true) : false;
const outDir = opt("--out", path.join(root, "avatars"));
const ids = args;
if (!ids.length) throw new Error("Welche Avatare? z. B. node scripts/avatars/render-previews.mjs disco-baer");

const page = `<!doctype html><html><body style="margin:0;background:transparent">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setSize(384, 384);
r.setClearColor(0x000000, 0);
r.outputColorSpace = THREE.SRGBColorSpace;
r.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(r.domElement);
window.render = async (url, clipName, t, head) => {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x302838, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(1.5, 2.5, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xb48cff, 1.6); rim.position.set(-2, 1.5, -2.5); scene.add(rim);
  const model = gltf.scene;
  const mixer = new THREE.AnimationMixer(model);
  const clip = gltf.animations.find((a) => a.name === clipName) ?? gltf.animations[0];
  if (clip) { mixer.clipAction(clip).play(); mixer.setTime(t); }
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const c = box.getCenter(new THREE.Vector3());
  const h = box.getSize(new THREE.Vector3()).y;
  scene.add(model);
  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 100);
  if (head) c.y = box.max.y - h * 0.17;
  const d = h * (head ? 0.75 : 2.85);
  cam.position.set(c.x + d * 0.28, c.y + h * 0.12, c.z + d * 0.96);
  cam.lookAt(c);
  r.render(scene, cam);
  return r.domElement.toDataURL("image/png");
};
window.ready = true;
</script></body></html>`;

const types = { ".js": "text/javascript", ".glb": "model/gltf-binary" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/") return res.writeHead(200, { "content-type": "text/html" }).end(page);
  const file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" }).end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const { port } = server.address();
const browser = await chromium.launch();
const tab = await browser.newPage({ viewport: { width: 384, height: 384 } });
await tab.goto(`http://127.0.0.1:${port}/`);
await tab.waitForFunction(() => window.ready);
const { writeFile } = await import("node:fs/promises");
for (const id of ids) {
  const data = await tab.evaluate(([u, c, t, k]) => window.render(u, c, t, k), [`/avatars/${id}.glb`, pose, at, headShot]);
  await writeFile(path.join(outDir, `${id}.png`), Buffer.from(data.split(",")[1], "base64"));
  console.log(`${id}.png`);
}
await browser.close();
server.close();
