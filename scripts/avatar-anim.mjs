// Tanz-Spuren der Avatare verschlanken, ohne die Bewegung zu ändern (läuft in scripts/optimize-avatars.mjs).
//
// - dropStaticChannels: Spuren, die in jedem Bild exakt der Ruhehaltung ihres Knochens entsprechen, fallen weg.
//   Ohne Spur bleibt der Knochen in Ruhehaltung (three.js mischt fehlende Spuren mit dem Ausgangszustand) –
//   das Bild ist also identisch. Typisch: Position aller Knochen außer der Hüfte, Größe außer den Gesichtsteilen.
// - packRotations: Drehungen als normierte Int16 statt Float32 (glTF erlaubt das für Rotationen ausdrücklich).
// - comparePoses: Probe nach dem Build – jede Spur des Originals wird in jedem Schlüsselbild mit dem Ergebnis
//   verglichen (fehlende Spur = Ruhehaltung). Weicht ein Knochen sichtbar ab, bricht der Build ab.
//
// Liegt bewusst außerhalb von scripts/avatars, damit es die Versionen der erzeugten Figuren nicht ändert.
import { Accessor } from "@gltf-transform/core";

/** Ruhewert eines Knotens für einen Animationspfad */
function restOf(node, path) {
  if (path === "rotation") return node.getRotation();
  if (path === "translation") return node.getTranslation();
  if (path === "scale") return node.getScale();
  return null;
}

/** Größte Abweichung einer Spur von einem festen Wert; Quaternionen vorzeichenunabhängig (q und −q sind gleich) */
function maxDeviation(values, n, rest, quat) {
  let worst = 0;
  for (let i = 0; i < values.length; i += n) {
    let d = 0;
    let dn = 0;
    for (let k = 0; k < n; k++) {
      d = Math.max(d, Math.abs(values[i + k] - rest[k]));
      dn = Math.max(dn, Math.abs(values[i + k] + rest[k]));
    }
    worst = Math.max(worst, quat ? Math.min(d, dn) : d);
  }
  return worst;
}

/**
 * Entfernt Spuren, deren Werte überall der Ruhehaltung entsprechen (Toleranz `eps`, Standard 1e-5 – deutlich unter
 * jeder sichtbaren Änderung). Gibt die Zahl entfernter Spuren zurück. Spuren auf Morph-Gewichte bleiben unberührt.
 */
export function dropStaticChannels(doc, eps = 1e-5) {
  let dropped = 0;
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode();
      const path = ch.getTargetPath();
      const rest = node && restOf(node, path);
      const sampler = ch.getSampler();
      if (!rest || !sampler || sampler.getInterpolation() === "CUBICSPLINE") continue;
      const out = sampler.getOutput();
      if (!out || out.getNormalized()) continue;
      if (maxDeviation(out.getArray(), out.getElementSize(), rest, path === "rotation") > eps) continue;
      ch.dispose();
      dropped++;
    }
    // Sampler ohne Spur aufräumen
    const used = new Set(anim.listChannels().map((c) => c.getSampler()));
    for (const s of anim.listSamplers()) if (!used.has(s)) s.dispose();
  }
  return dropped;
}

/** Drehungen der Tänze als normierte Int16 speichern (halbe Größe, Fehler < 0,01°). Gibt die Zahl der Spuren zurück. */
export function packRotations(doc) {
  const done = new Set();
  for (const anim of doc.getRoot().listAnimations())
    for (const ch of anim.listChannels()) {
      if (ch.getTargetPath() !== "rotation") continue;
      const out = ch.getSampler()?.getOutput();
      if (!out || done.has(out) || out.getComponentType() !== Accessor.ComponentType.FLOAT) continue;
      const src = out.getArray();
      const packed = Int16Array.from(src, (v) => Math.max(-32767, Math.min(32767, Math.round(v * 32767))));
      out.setArray(packed).setNormalized(true);
      done.add(out);
    }
  return done.size;
}

/** Wert einer Spur zur Zeit t (LINEAR/STEP; Quaternionen normiert linear) */
function sample(times, values, n, t, step) {
  let i = 0;
  while (i < times.length - 1 && times[i + 1] <= t) i++;
  const j = Math.min(i + 1, times.length - 1);
  const span = times[j] - times[i];
  const u = step || span <= 0 ? 0 : Math.min(1, Math.max(0, (t - times[i]) / span));
  const a = values.slice(i * n, i * n + n);
  const b = values.slice(j * n, j * n + n);
  if (n === 4 && a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0) for (let k = 0; k < 4; k++) b[k] = -b[k];
  return a.map((v, k) => v + (b[k] - v) * u);
}

/** Werte eines Accessors als Gleitkommazahlen (normierte Ganzzahlen werden zurückgerechnet) */
function floats(acc) {
  const arr = acc.getArray();
  if (!acc.getNormalized()) return Array.from(arr);
  const max = arr instanceof Int16Array ? 32767 : arr instanceof Int8Array ? 127 : arr instanceof Uint16Array ? 65535 : 255;
  return Array.from(arr, (v) => Math.max(v / max, -1));
}

/** Winkel zwischen zwei Quaternionen in Grad */
function angleDeg(a, b) {
  const la = Math.hypot(...a);
  const lb = Math.hypot(...b);
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) / (la * lb || 1);
  return (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI;
}

/**
 * Vergleicht alle Spuren von `before` mit `after` in jedem Schlüsselbild. Liefert die größten Abweichungen:
 * Drehung in Grad, Position/Größe absolut. Fehlende Spur in `after` = Ruhehaltung des Knotens.
 */
export function comparePoses(before, after) {
  const index = new Map();
  for (const anim of after.getRoot().listAnimations())
    for (const ch of anim.listChannels())
      index.set(`${anim.getName()}|${ch.getTargetNode()?.getName()}|${ch.getTargetPath()}`, ch);
  const nodes = new Map(
    after
      .getRoot()
      .listNodes()
      .map((n) => [n.getName(), n]),
  );
  const worst = { rotationDeg: 0, translation: 0, scale: 0, where: "" };
  for (const anim of before.getRoot().listAnimations())
    for (const ch of anim.listChannels()) {
      const path = ch.getTargetPath();
      const key = path === "rotation" ? "rotationDeg" : path;
      if (!(key in worst)) continue;
      const nodeName = ch.getTargetNode()?.getName();
      const s = ch.getSampler();
      const times = Array.from(s.getInput().getArray());
      const vals = floats(s.getOutput());
      const n = s.getOutput().getElementSize();
      const other = index.get(`${anim.getName()}|${nodeName}|${path}`);
      const node = nodes.get(nodeName);
      if (!node) throw new Error(`Knoten ${nodeName} fehlt nach der Optimierung`);
      for (let i = 0; i < times.length; i++) {
        const want = vals.slice(i * n, i * n + n);
        const got = other
          ? sample(
              Array.from(other.getSampler().getInput().getArray()),
              floats(other.getSampler().getOutput()),
              n,
              times[i],
              other.getSampler().getInterpolation() === "STEP",
            )
          : restOf(node, path);
        const d = path === "rotation" ? angleDeg(want, got) : Math.max(...want.map((v, k) => Math.abs(v - got[k])));
        if (d > worst[key]) Object.assign(worst, { [key]: d, where: `${anim.getName()} ${nodeName}.${path}` });
      }
    }
  return worst;
}
