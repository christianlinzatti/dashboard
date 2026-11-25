import { BufferAttribute, BufferGeometry, CylinderGeometry, IcosahedronGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { B_STAGE_R, B_STAGE_Z, RUNWAY_HALF_W } from "@/lib/stage/staging";
export const MAX = 520;
/** Die Menge steht tiefer als die Bühne (Bühnenkante ≈ 1 m hoch): Köpfe knapp unter Podesthöhe, Hände darüber */
export const BASE_Y = -1.1;

/** Gemeinsame Bewegungslogik für Silhouetten und Lichter (gleiche Person → gleiche Armhaltung). */
export const MOTION = /* glsl */ `
  uniform float uBeats, uTime, uHands, uJump, uPhones, uSway, uBaseY, uMosh, uClap, uWave, uSing, uCircle, uRunway;
  uniform vec3 uCam;
  const float PI = 3.14159265;
  const float ARM = 0.58;
  const vec2 SHOULDER = vec2(0.26, 1.38);

  /** La-Ola dieser Person (je Vertex in main() gesetzt): die Welle läuft alle zwei Takte von links nach rechts */
  float gOla = 0.0;
  float ola(vec3 spot) {
    if (uWave <= 0.001) return 0.0;
    float across = atan(spot.x, spot.y) / 4.0 + 0.5;
    float ph = fract(uBeats / 8.0 - across);
    return uWave * smoothstep(0.0, 0.05, ph) * smoothstep(0.17, 0.06, ph);
  }
  float handsUp(vec4 r) { return step(r.x, uHands); }
  float hasPhone(vec4 r) { return step(r.y, uPhones); }
  /** Klatscher sind andere Leute als die mit erhobenen Händen (vom anderen Ende der Zufallswerte) */
  float clapper(vec4 r) { return step(1.0 - uClap, r.x) * (1.0 - handsUp(r)); }
  /** Armwinkel: 0 = hängt, ~2,75 = gestreckt nach oben (leicht nach vorn) */
  float armAngle(vec4 r, float side) {
    float pump = 2.6 + 0.32 * sin(uBeats * 2.0 * PI + r.z * 1.7);
    float up = handsUp(r) * pump;
    up = mix(up, 2.45, clapper(r));
    if (side > 0.0) up = mix(up, 2.78 + 0.06 * sin(uTime * 1.3 + r.z * 6.0), hasPhone(r));
    up = mix(up, 2.95, gOla);
    return max(up, 0.12);
  }
  /** Klatschen: beide Arme schwingen zur Mitte, die Hände treffen sich auf jedem Schlag */
  float armRoll(vec4 r, float side) {
    float hit = pow(1.0 - abs(sin(PI * uBeats)), 3.0);
    return side * clapper(r) * (1.0 - hasPhone(r)) * (0.12 + 0.5 * hit) * (1.0 - gOla);
  }
  /** Armpunkt (Grundhaltung: hängend) an die aktuelle Armhaltung: erst heben (um x), dann zur Mitte schwingen (um z) */
  vec3 armXform(vec3 p, float side, vec4 r) {
    float a = -armAngle(r, side);
    vec3 pivot = vec3(side * SHOULDER.x, SHOULDER.y, 0.0);
    vec3 q = p - pivot;
    q = vec3(q.x, q.y * cos(a) - q.z * sin(a), q.y * sin(a) + q.z * cos(a));
    float th = armRoll(r, side);
    q = vec3(q.x * cos(th) - q.y * sin(th), q.x * sin(th) + q.y * cos(th), q.z);
    return pivot + q;
  }
  /** Moshpit: nur vor der Bühnenmitte (vorne, nicht zu weit seitlich) */
  float pit(vec3 spot) {
    return uMosh * smoothstep(9.5, 6.5, length(spot.xy)) * smoothstep(3.6, 1.8, abs(spot.x));
  }
  float hop(vec4 r) {
    return uJump * step(r.w, 0.25 + 0.75 * uJump) * abs(sin(PI * (uBeats + r.z * 0.12))) * 0.2;
  }
  float swayX(vec4 r, vec3 spot, float y) {
    // Mitsingen: alle schwenken gemeinsam im Takt (ein Schwung über zwei Schläge), weiter ausholend
    float own = uTime * 1.25 + r.z * 2.0 + spot.x * 0.3;
    float together = uBeats * PI * 0.5;
    return sin(mix(own, together, uSing)) * (0.07 + 0.08 * uSing) * uSway * max(y - 0.8, 0.0);
  }
  /** Mitte des Circle-Pits (links vor der Bühne, neben dem Laufsteg) */
  const vec2 PIT = vec2(-3.0, 8.4);
  /** Blickrichtung der Person (in place() gesetzt): zur Bühne, im Circle-Pit in Laufrichtung */
  vec2 gFace = vec2(0.0, -1.0);
  /**
   * Platz einer Person: Laufsteg und B-Bühne bleiben frei (wer dort stünde, rückt zur Seite); im Circle-Pit rennen
   * alle in gleichem Tempo um eine leere Mitte
   */
  vec2 place(vec2 s) {
    vec2 runDir = vec2(0.0);
    float running = 0.0;
    if (uRunway > 0.5) {
      vec2 d = s - vec2(0.0, ${B_STAGE_Z.toFixed(2)});
      float r = length(d);
      float keep = ${(B_STAGE_R + 0.35).toFixed(2)};
      float halfW = ${(RUNWAY_HALF_W + 0.3).toFixed(2)};
      if (r < keep) s = vec2(0.0, ${B_STAGE_Z.toFixed(2)}) + d / max(r, 0.001) * (keep + (keep - r) * 0.5);
      else if (s.y < ${B_STAGE_Z.toFixed(2)} && abs(s.x) < halfW) s.x = (s.x < 0.0 ? -1.0 : 1.0) * (halfW + (halfW - abs(s.x)) * 0.5);
    }
    if (uCircle > 0.001) {
      vec2 d = s - PIT;
      float r = length(d);
      float w = uCircle * smoothstep(2.9, 2.2, r);
      if (w > 0.0) {
        float rr = max(r, 1.2);
        float a = atan(d.y, d.x) - uTime * 1.5 / rr;
        s = mix(s, PIT + rr * vec2(cos(a), sin(a)), w);
        // im Uhrzeigersinn: die Läufer schauen tangential nach vorn
        runDir = vec2(sin(a), -cos(a));
        running = w;
      }
    }
    vec2 toStage = normalize(-s);
    gFace = running > 0.0 ? normalize(mix(toStage, runDir, smoothstep(0.0, 0.6, running))) : toStage;
    return s;
  }
  /** Personen-Koordinaten → Welt: zur Bühnenmitte gedreht, in den Graben gestellt, nahe an der Kamera eingezogen */
  vec3 toWorld(vec3 p, vec3 spot, vec4 r) {
    spot = vec3(place(spot.xy), spot.z);
    vec2 f = gFace;
    float near = smoothstep(1.2, 2.1, distance(spot.xy, uCam.xz));
    p.x += swayX(r, spot, p.y);
    p *= spot.z * near;
    // Moshpit: Leute rempeln sich (seitlich und vor/zurück), höher und wilder springen
    float m = pit(spot);
    vec2 shove = m * vec2(sin(uTime * 5.3 + r.z * 23.0) * 0.32, cos(uTime * 4.1 + r.x * 17.0) * 0.22);
    float extra = m * abs(sin(PI * (uBeats * 1.5 + r.w * 3.0))) * 0.22;
    return vec3(
      spot.x + shove.x + p.x * f.y + p.z * f.x,
      uBaseY + p.y + (hop(r) + extra + gOla * 0.24) * near,
      spot.y + shove.y - p.x * f.x + p.z * f.y
    );
  }
`;

export function personGeometry() {
  const part = (g: BufferGeometry, id: number) => {
    const flat = g.index ? g.toNonIndexed() : g;
    flat.deleteAttribute("uv");
    flat.setAttribute("aPart", new BufferAttribute(new Float32Array(flat.getAttribute("position").count).fill(id), 1));
    return flat;
  };
  const arm = (side: number) => new CylinderGeometry(0.04, 0.032, 0.58, 5).translate(side * 0.26, 1.38 - 0.29, 0);
  return mergeGeometries([
    // Rumpf als flacher Sechskant (rundere Silhouette als ein Quader)
    part(new CylinderGeometry(0.2, 0.16, 0.62, 6).scale(1, 1, 0.6).translate(0, 1.13, 0), 0),
    part(new IcosahedronGeometry(0.115, 1).translate(0, 1.57, 0), 0),
    part(arm(-1), 1),
    part(arm(1), 2),
  ]);
}
