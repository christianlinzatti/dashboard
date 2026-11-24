"use client";

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import { rng } from "@/lib/dance/rng";
import { songContext } from "@/lib/song-context/store";
import type { LightFrame } from "@/lib/stage/lights";

/** Was jede Kulisse bekommt: Akzentfarbe des Themas und das aktuelle Lichtbild */
export type VenueProps = { accent: string; lightsRef: React.RefObject<LightFrame | null> };

export const songSeconds = () => songContext.getState().positionMs / 1000;

export const plainVertex = /* glsl */ `
  varying vec2 vUv; varying vec3 vPos; varying vec3 vWorld;
  void main() {
    vUv = uv; vPos = position; vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Rauer Beton/Stein als Canvas-Textur (kachelbar) */
export function concreteTexture(seed: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const r = rng(seed);
  g.fillStyle = "#3c3b3a";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 40 + r.next() * 40;
    g.fillStyle = `rgba(${v},${v},${v - 3},${0.12 + r.next() * 0.2})`;
    g.fillRect(r.next() * 256, r.next() * 256, 1 + r.next() * 3, 1 + r.next() * 3);
  }
  // Schalungsfugen
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (let i = 0; i < 4; i++) g.fillRect(0, i * 64, 256, 2);
  g.fillRect(127, 0, 2, 256);
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

// Instancing liegt in ../instances.tsx (auch außerhalb der Kulissen genutzt)
export { Instances, mat, type Xf } from "../instances";
