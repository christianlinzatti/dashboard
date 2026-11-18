import type { Choreography } from "@/lib/dance/plan";
import { phraseIndexAt } from "@/lib/dance/evaluate";
import type { SectionKind, SongStatic } from "@/lib/song-context/schema";
import { climaxAt } from "./climax";

export type LightScene = "intro" | "strophe" | "refrain" | "bridge" | "instrumental" | "drop" | "outro";

export type HeadState = {
  /** Schwenk (Rad, um Y) und Neigung (Rad, 0 = senkrecht nach unten) */
  pan: number;
  tilt: number;
  color: string;
  /** 0..1 */
  intensity: number;
};

export type LightFrame = {
  scene: LightScene;
  heads: HeadState[];
  lasers: { on: boolean; spread: number; rotation: number; color: string; intensity: number };
  /** 0..1 Blitz-Helligkeit (nur bei Drops, höchstens ein Blitz pro Schlag) */
  strobe: number;
  wall: { colorA: string; colorB: string; level: number; mode: 0 | 1 | 2 };
  fog: number;
  /** Blinder (warme Fluter ins Publikum) 0..1: blitzen beim Einsatz eines Höhepunkts und bei Drops auf und klingen ab */
  blinders: number;
  /** Höhepunkt: 0..1 wie dunkel die Bühne ist (Blackout vor dem Einsatz) */
  blackout: number;
  /** Countdown auf der Wand (4, 3, 2, 1) oder null */
  countdown: number | null;
  /**
   * Geräteunabhängiges Lichtsignal (z. B. für Govee). `chase` 0..1 = Lauflicht über die Lampen (Position),
   * −1 = aus.
   */
  signal: { base: string; accent: string; brightness: number; pulse: number; chase: number };
};

export type LightInput = {
  t: number;
  anchorMs: number | null;
  dropMs: number | null;
  energy: number;
  micActive: boolean;
  singerColor?: string;
  strobeAllowed: boolean;
  /** Bühnen-Thema: Helligkeit der Moving Heads (Jazz gedämpft) und ob Laser erlaubt sind */
  headLevel?: number;
  lasers?: boolean;
};

const SCENE_OF: Record<SectionKind, LightScene> = {
  intro: "intro",
  verse: "strophe",
  prechorus: "strophe",
  chorus: "refrain",
  bridge: "bridge",
  instrumental: "instrumental",
  outro: "outro",
};

/** Bewegungsprofil je Szene: aktive Köpfe (Anteil), Schwenk-Amplitude, Periode in Schlägen, Helligkeit. */
const PROFILE: Record<
  LightScene,
  { share: number; amp: number; period: number; base: number; lasers: boolean; fog: number; wall: 0 | 1 | 2 }
> = {
  intro: { share: 0.25, amp: 0.15, period: 32, base: 0.45, lasers: false, fog: 0.9, wall: 0 },
  strophe: { share: 0.5, amp: 0.35, period: 16, base: 0.55, lasers: false, fog: 0.5, wall: 0 },
  refrain: { share: 1, amp: 0.7, period: 4, base: 0.85, lasers: true, fog: 0.6, wall: 1 },
  bridge: { share: 0.5, amp: 0.1, period: 32, base: 0.4, lasers: false, fog: 0.8, wall: 2 },
  instrumental: { share: 1, amp: 0.55, period: 8, base: 0.75, lasers: true, fog: 0.6, wall: 1 },
  drop: { share: 1, amp: 0.9, period: 2, base: 1, lasers: true, fog: 0.4, wall: 1 },
  outro: { share: 0.25, amp: 0.15, period: 32, base: 0.4, lasers: false, fog: 0.9, wall: 0 },
};

/**
 * LightDirector: Lichtszene zur Songzeit. Abschnitt bestimmt die Szene, Bewegungen laufen
 * im Beat-Raster, Farbwechsel auf Taktanfang, Drops mit Strobe und Lasern.
 * Zustandslos und deterministisch (gleiche Songzeit → gleiches Licht).
 */
export function lightsAt(song: SongStatic, c: Choreography, heads: number, input: LightInput): LightFrame {
  const { t } = input;
  const phrase = c.phrases[phraseIndexAt(c, t)];
  // Höhepunkt (geplant): Blackout mit Countdown vor dem Einsatz, danach ein Takt wie ein Drop
  const climax = climaxAt(c.climaxes ?? [], t, c.barMs);
  const micDrop = input.dropMs !== null && t >= input.dropMs && t < input.dropMs + 2 * c.barMs;
  const inDrop = micDrop || climax?.phase === "hit";
  // Blackout blendet über den ersten Schlag ab
  const blackout = climax?.phase === "blackout" ? Math.min(1, climax.beats) : 0;
  let scene: LightScene = inDrop ? "drop" : SCENE_OF[phrase?.section ?? "verse"];
  // Energie aus dem Plan (+ Mikro) kann Strophen anheben / Refrains dämpfen
  const energy = input.micActive ? input.energy : ((phrase?.energy ?? 1) + 0.5) / 4;
  if (scene === "refrain" && energy < 0.3) scene = "strophe";
  const prof = PROFILE[scene];

  const beats = (t - (input.anchorMs ?? 0)) / c.beatMs;
  const beatPhase = ((beats % 1) + 1) % 1;
  const bar = Math.floor(beats / 4);
  const pulse = Math.pow(1 - beatPhase, 2);

  const pal = song.album.palette;
  const artistColors = song.artists.map((a) => a.color);
  const colors = [pal.accent, pal.dominant, ...artistColors];
  const barColor = colors[((bar % colors.length) + colors.length) % colors.length]!;
  const alt = colors[(((bar + 1) % colors.length) + colors.length) % colors.length]!;

  const active = Math.max(1, Math.round(heads * prof.share));
  const out: HeadState[] = Array.from({ length: heads }, (_, i) => {
    const center = i - (heads - 1) / 2;
    // aktive Köpfe von der Mitte nach außen
    const rank = Math.abs(center) * 2;
    const on = rank < active;
    const phase = (beats / prof.period) * Math.PI * 2 + (scene === "refrain" || scene === "drop" ? 0 : i * 0.9);
    const mirror = center < 0 ? -1 : 1;
    const pan = Math.sin(phase) * prof.amp * mirror + center * 0.12;
    const tilt = 0.35 + Math.cos(phase * 0.5) * prof.amp * 0.4;
    const color = scene === "bridge" || scene === "intro" ? (input.singerColor ?? pal.accent) : i % 2 === 0 ? barColor : alt;
    const intensity =
      (on ? Math.min(1, prof.base * (0.75 + 0.25 * pulse) * (0.7 + energy * 0.5)) * (input.headLevel ?? 1) : 0) * (1 - blackout);
    return { pan, tilt, color, intensity };
  });

  // Strobe: nur bei Drops, ein Blitz pro Schlag, bei sehr schnellen Songs jeder zweite (Fotosensitivität)
  const fast = 60_000 / c.beatMs > 150;
  const flashBeat = !fast || Math.floor(beats) % 2 === 0;
  // beim geplanten Einsatz zählen die Schläge ab dem Einsatz (Blitz genau auf „1“)
  const flashPhase = climax?.phase === "hit" ? climax.beats % 1 : beatPhase;
  const strobe = inDrop && input.strobeAllowed && flashBeat && flashPhase < 0.12 ? 1 - flashPhase / 0.12 : 0;

  // Blinder: beim Einsatz voll an, klingen über den Schlag ab; mit Strobe-Erlaubnis auf jedem Schlag des Einsatztakts,
  // sonst nur ein einziges Aufleuchten auf der „1“ (langsamer als ein Blitz, aber trotzdem schonend)
  const sinceHit = climax?.phase === "hit" ? climax.beats : micDrop ? (t - input.dropMs!) / c.beatMs : -1;
  const blinders =
    sinceHit < 0 || sinceHit >= 4
      ? 0
      : input.strobeAllowed
        ? Math.pow(1 - (sinceHit % 1), 1.6) * (1 - sinceHit / 6)
        : Math.max(0, 1 - sinceHit / 1.5);

  return {
    scene,
    heads: out,
    blinders,
    lasers: {
      on: prof.lasers && energy > 0.45 && input.lasers !== false && blackout === 0,
      spread: scene === "drop" ? 1.1 : 0.55 + 0.25 * Math.sin(beats / 8),
      rotation: Math.sin(beats / 16) * 0.4,
      color: alt,
      intensity: (scene === "drop" ? 1 : 0.6) * (0.6 + 0.4 * pulse),
    },
    strobe,
    wall: {
      colorA: pal.dominant,
      colorB: barColor,
      level: Math.min(1, energy * 0.8 + pulse * 0.3) * (1 - 0.9 * blackout),
      mode: prof.wall,
    },
    fog: prof.fog,
    blackout,
    countdown: climax?.countdown ?? null,
    signal: {
      base: pal.dominant,
      accent: barColor,
      // Blackout: Lampen fast aus; Einschlag: volle Helligkeit
      brightness: climax?.phase === "hit" ? 1 : prof.base * (0.6 + energy * 0.4) * (1 - 0.95 * blackout),
      pulse: blackout ? 0 : scene === "intro" || scene === "outro" ? pulse * 0.2 : pulse,
      // Lauflicht über die Lampen beim großen Einsatz: einmal pro Schlag von links nach rechts
      chase: climax?.phase === "hit" && climax.big ? flashPhase : -1,
    },
  };
}
