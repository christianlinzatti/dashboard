"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, Color, type Group, type MeshBasicMaterial, type Vector3 } from "three";
import type { SongStatic } from "@/lib/song-context/schema";
import { songContext } from "@/lib/song-context/store";
import { signAt, type SignState, type SignWord } from "@/lib/stage/chorus-sign";

const TEX_W = 2048;
const TEX_H = 256;
/** Breite der Schrift über der Bühne (m); die Höhe folgt dem Seitenverhältnis der Textur */
const WIDTH = 5.2;
const HEIGHT = (WIDTH * TEX_H) / TEX_W;
/** knapp über den Köpfen, vor der Wand – so in Totale und Halbnah im Bild, in Nahaufnahmen darüber */
const SIGN_Y = 2.45;
const SIGN_Z = -0.8;

/** Zeile setzen (Platz für alle Wörter), aber nur die schon gesungenen zeichnen – sie leuchten an ihrem Platz auf */
function drawSign(canvas: HTMLCanvasElement, words: readonly SignWord[], lit: number) {
  const g = canvas.getContext("2d");
  if (!g) return;
  g.clearRect(0, 0, TEX_W, TEX_H);
  const texts = words.map((w) => w.text.toLocaleUpperCase("de-DE"));
  let size = 170;
  g.font = `900 ${size}px system-ui, sans-serif`;
  const full = g.measureText(texts.join(" ")).width;
  if (full > TEX_W * 0.94) size = Math.floor((size * TEX_W * 0.94) / full);
  g.font = `900 ${size}px system-ui, sans-serif`;
  const space = g.measureText(" ").width;
  const widths = texts.map((t) => g.measureText(t).width);
  let x = (TEX_W - (widths.reduce((a, b) => a + b, 0) + space * (texts.length - 1))) / 2;
  g.textBaseline = "middle";
  g.fillStyle = "#fff";
  texts.forEach((t, i) => {
    if (i < lit) g.fillText(t, x, TEX_H / 2);
    x += widths[i]! + space;
  });
}

/** Textur neu zeichnen und hochladen lassen */
function redraw(tex: CanvasTexture, canvas: HTMLCanvasElement, s: SignState) {
  drawSign(canvas, s.words, s.lit);
  tex.needsUpdate = true;
}

type Parts = { group: Group; front: MeshBasicMaterial; back: MeshBasicMaterial };

/** Ein Bild der Leuchtschrift: Deckkraft, Aufspringen des jüngsten Worts, Takt-Puls, leichtes Schweben */
function applySign(p: Parts, s: SignState | null, positionMs: number, bpm: number, base: Color, cam: Vector3) {
  p.group.visible = !!s;
  if (!s) return;
  const beatMs = 60_000 / (bpm || 120);
  const beat = Math.pow(1 - (positionMs % beatMs) / beatMs, 3);
  p.group.scale.setScalar(1 + 0.045 * s.pop);
  p.group.position.y = SIGN_Y + 0.04 * Math.sin(positionMs / 900);
  // zur Kamera gedreht (auch in Seitenansichten lesbar), dazu ein leichtes Pendeln
  p.group.rotation.y = Math.atan2(cam.x - p.group.position.x, cam.z - p.group.position.z) + 0.04 * Math.sin(positionMs / 2300);
  // über 1: der Glow (Bloom) greift; auf den Schlag etwas heller
  p.front.color.copy(base).multiplyScalar(1.3 + 0.5 * beat + 0.4 * s.pop);
  p.front.opacity = s.amount;
  p.back.opacity = 0.85 * s.amount;
}

/**
 * Leuchtschrift über der Bühne im Refrain: die gesungene Zeile, Wort für Wort, mit Tiefe (versetzte dunkle Kopie in
 * der Akzentfarbe). Zwei Zeichenaufrufe; die Textur wird nur neu gezeichnet, wenn ein Wort dazukommt.
 */
export function ChorusSign({ song, accent }: { song: SongStatic; accent: string }) {
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = TEX_W;
    c.height = TEX_H;
    return c;
  }, []);
  const tex = useMemo(() => new CanvasTexture(canvas), [canvas]);
  useEffect(() => () => tex.dispose(), [tex]);
  const drawn = useRef("");
  const group = useRef<Group>(null);
  const front = useRef<MeshBasicMaterial>(null);
  const back = useRef<MeshBasicMaterial>(null);
  const white = useMemo(() => new Color("#fff4e0"), []);

  const lines = song.lyrics?.quality === "plain" ? [] : (song.lyrics?.lines ?? []);
  const sections = song.lyrics?.sections;
  const inChorus = useMemo(() => {
    const chorus = (sections ?? []).filter((s) => s.kind === "chorus");
    return (ms: number) => chorus.some((s) => s.startMs <= ms && ms < s.endMs);
  }, [sections]);

  useFrame(({ camera }) => {
    if (!group.current || !front.current || !back.current) return;
    const { positionMs, playback, derived, live } = songContext.getState();
    const t = positionMs - playback.offsetMs;
    const s = lines.length ? signAt(lines, derived.lineIdx, t, inChorus) : null;
    const key = s ? `${song.trackKey}:${s.lineIdx}:${s.lit}` : "";
    if (s && key !== drawn.current) {
      redraw(tex, canvas, s);
      drawn.current = key;
    }
    applySign({ group: group.current, front: front.current, back: back.current }, s, t, live.bpm, white, camera.position);
  });

  return (
    <group ref={group} position={[0, SIGN_Y, SIGN_Z]} visible={false}>
      <mesh position={[0.05, -0.07, -0.12]} renderOrder={1}>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshBasicMaterial ref={back} map={tex} color={accent} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh renderOrder={2}>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshBasicMaterial ref={front} map={tex} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}
