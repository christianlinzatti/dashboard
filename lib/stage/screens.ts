import { phraseIndexAt, type Cam } from "@/lib/dance/evaluate";
import type { Vec2 } from "@/lib/dance/formations";
import type { Choreography } from "@/lib/dance/plan";

/**
 * Bildregie der Live-Bildschirme (wie die Kamerateams bei großen Konzerten): alle zwei Takte ein Schnitt.
 * Gesungen wird meist der Sänger in Nahaufnahme gezeigt, dazwischen die Crew von der Bühnenkante, das Publikum von
 * der Bühne aus und eine Totale vom Mischpult. Rein aus Songzeit und Plan – gleiche Zeit, gleiches Bild.
 */
export type LiveShotName = "saenger" | "crew" | "publikum" | "totale";
export type LiveShot = Cam & { name: LiveShotName };

export const SCREEN_ASPECT = 16 / 9;
/** Länge einer Einstellung in Takten */
export const LIVE_CUT_BARS = 2;

const SEQUENCE: Record<"chorus" | "vocal" | "instrumental", LiveShotName[]> = {
  chorus: ["saenger", "publikum", "saenger", "crew", "saenger", "totale"],
  vocal: ["saenger", "saenger", "crew"],
  instrumental: ["crew", "publikum", "totale", "crew"],
};

/** Kopfhöhe der Avatare (Zielgröße 1,8 m) */
const HEAD_Y = 1.55;

export function liveShotAt(c: Choreography, t: number, focus: Vec2 | undefined): LiveShot {
  const slot = Math.floor(Math.max(t, 0) / (LIVE_CUT_BARS * c.barMs));
  const phrase = c.phrases[phraseIndexAt(c, t)];
  const kind = phrase?.section === "chorus" ? "chorus" : focus && phrase?.section !== "instrumental" ? "vocal" : "instrumental";
  const seq = SEQUENCE[kind];
  let name = seq[slot % seq.length]!;
  if (name === "saenger" && !focus) name = "crew";
  const side = slot % 2 === 0 ? 1 : -1;
  // Handkamera: ruhiges Atmen, nie ganz still
  const s = t / 1000;
  const sway = [Math.sin(s * 0.9 + slot) * 0.03, Math.sin(s * 1.3 + slot * 2) * 0.02] as const;
  switch (name) {
    case "saenger": {
      const [x, z] = focus!;
      return {
        name,
        pos: [x + side * 0.45 + sway[0], HEAD_Y - 0.05 + sway[1], z + 1.9],
        target: [x, HEAD_Y - 0.02, z],
        fov: 22,
      };
    }
    case "crew":
      return { name, pos: [side * 2.6 + sway[0], 0.9 + sway[1], 3.4], target: [0, 1.0, 0], fov: 34 };
    case "publikum":
      // von hinten über die Schultern der Tänzer ins Publikum
      return { name, pos: [side * 0.8 + sway[0], 2.2 + sway[1], -1.2], target: [0, 0.6, 9], fov: 44 };
    case "totale":
      return { name, pos: [sway[0] * 2, 3.2 + sway[1], 12.5], target: [0, 1.2, 0], fov: 26 };
  }
}
