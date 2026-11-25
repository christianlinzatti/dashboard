import type { Choreography } from "@/lib/dance/plan";
import { exitAt, phraseIndexAt } from "@/lib/dance/evaluate";
import type { SectionKind, SongStatic } from "@/lib/song-context/schema";
import { climaxAt } from "./climax";
import { crowdProfile } from "./crowd";
import { buildAt } from "./staging";

export type LightScene =
  | "intro"
  | "strophe"
  | "refrain"
  | "bridge"
  | "instrumental"
  | "drop"
  | "outro"
  | "applaus"
  /** Spannungsaufbau vor einem großen Einsatz: alles zieht sich zusammen und wird schneller */
  | "aufbau";

/** Danke-Licht beim Applaus am Songende: warmes Weiß-Orange auf Bühne, Publikum und Lampen im Raum */
export const APPLAUSE_WARM = "#ffb066";
export const APPLAUSE_BASE = "#ff7a2e";
/** Feuerzeug-Glut für die Lampen im Raum (Balladen) */
const LIGHTER_GLOW = "#ffa040";

export type HeadState = {
  /** Schwenk (Rad, um Y) und Neigung (Rad, 0 = senkrecht nach unten) */
  pan: number;
  tilt: number;
  color: string;
  /** 0..1 */
  intensity: number;
  /**
   * Höhe der Lampe an ihrer Hängung (m, 0 = oben an der Traverse, negativ = abgesenkt): in ruhigen Teilen hängen die
   * Lampen tief und wogen als Welle, im Refrain und Drop schießen sie nach oben
   */
  y: number;
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
  /** Songzeit des letzten gehörten Hi-Hat-Schlags (Mikrofon): die Laser flackern darauf */
  hatMs?: number | null;
};

/** Hi-Hat-Impuls: kurz und spitz (ein Laserblitz je Schlag) */
const HAT_DECAY_MS = 70;

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
  applaus: { share: 1, amp: 0.2, period: 16, base: 0.8, lasers: false, fog: 0.5, wall: 0 },
  aufbau: { share: 1, amp: 0.25, period: 8, base: 0.7, lasers: false, fog: 0.9, wall: 1 },
};

/** Hängehöhe je Szene (m unter der Traverse) und Wogen der Lampenreihe (Amplitude) */
const RIG: Record<LightScene, { y: number; wave: number }> = {
  intro: { y: -1.05, wave: 0.22 },
  outro: { y: -1.05, wave: 0.22 },
  bridge: { y: -0.9, wave: 0.28 },
  strophe: { y: -0.55, wave: 0.12 },
  refrain: { y: 0, wave: 0 },
  instrumental: { y: -0.2, wave: 0.15 },
  drop: { y: 0, wave: 0 },
  applaus: { y: -0.4, wave: 0.08 },
  aufbau: { y: -1.05, wave: 0 },
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
  // Abgang (Winken, Verbeugung): Danke-Licht, warm über alles
  const applause = !inDrop && exitAt(c, t) !== null;
  // Aufbau: vier Takte vor einem großen Einsatz (Countdown) bzw. einem bekannten Drop
  const build = inDrop || applause || blackout > 0 ? 0 : buildAt(c, t);
  let scene: LightScene = inDrop ? "drop" : applause ? "applaus" : build > 0 ? "aufbau" : SCENE_OF[phrase?.section ?? "verse"];
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

  // Aufbau: das Licht flackert immer schneller (Achtel, Sechzehntel, Zweiunddreißigstel) und wird heller
  const sub = build < 0.5 ? 2 : build < 0.8 ? 4 : 8;
  const flick = build > 0 ? Math.pow(1 - ((((beats * sub) % 1) + 1) % 1), 2) : 0;
  const rig = RIG[scene];
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
    const color =
      scene === "applaus"
        ? APPLAUSE_WARM
        : scene === "bridge" || scene === "intro"
          ? (input.singerColor ?? pal.accent)
          : i % 2 === 0
            ? barColor
            : alt;
    const intensity =
      (on ? Math.min(1, prof.base * (0.75 + 0.25 * pulse) * (0.7 + energy * 0.5)) * (input.headLevel ?? 1) : 0) * (1 - blackout);
    // kinetische Hängung: Welle über die Reihe; im Aufbau ziehen sie gemeinsam hoch
    const wave = Math.sin((beats / 8) * Math.PI * 2 + center * 0.8) * rig.wave;
    const y = scene === "aufbau" ? -1.05 * (1 - build) + 0.12 * build : rig.y + wave;
    if (scene === "aufbau") {
      // alle Kegel schwenken zur Bühnenmitte und blitzen im immer schnelleren Raster
      return {
        pan: pan * (1 - build),
        tilt: tilt + (0.5 - tilt) * build,
        color,
        intensity: Math.min(1, (0.3 + 0.7 * build) * (0.45 + 0.55 * flick)) * (input.headLevel ?? 1),
        y,
      };
    }
    return { pan, tilt, color, intensity, y };
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

  // Mit Mikrofon: die Laser blitzen auf jedem gehörten Hi-Hat-Schlag auf und fächern dabei kurz auf
  const hat = input.micActive && input.hatMs != null && t >= input.hatMs ? Math.exp(-(t - input.hatMs) / HAT_DECAY_MS) : null;
  const laserBase = (scene === "drop" ? 1 : 0.6) * (0.6 + 0.4 * pulse);

  return {
    scene,
    heads: out,
    blinders,
    lasers: {
      on: prof.lasers && energy > 0.45 && input.lasers !== false && blackout === 0,
      spread: (scene === "drop" ? 1.1 : 0.55 + 0.25 * Math.sin(beats / 8)) + (hat ?? 0) * 0.15,
      rotation: Math.sin(beats / 16) * 0.4,
      color: alt,
      intensity: hat === null ? laserBase : laserBase * (0.35 + 0.65 * hat),
    },
    strobe,
    wall: {
      colorA: pal.dominant,
      colorB: barColor,
      level:
        scene === "aufbau"
          ? (0.25 + 0.75 * build) * (0.4 + 0.6 * flick)
          : Math.min(1, energy * 0.8 + pulse * 0.3) * (1 - 0.9 * blackout),
      mode: prof.wall,
    },
    fog: scene === "aufbau" ? 0.6 + 0.4 * build : prof.fog,
    blackout,
    countdown: climax?.countdown ?? null,
    signal: roomSignal(),
  };

  /**
   * Lampen im Raum (Govee) folgen den Show-Momenten: Blackout vor dem Einsatz (fast aus), Einschlag voll mit Lauflicht,
   * Applaus warm-orange und ruhig, Balladen mit Handy-/Feuerzeug-Meer: sanftes, unregelmäßiges Flimmern.
   */
  function roomSignal(): LightFrame["signal"] {
    if (scene === "applaus") return { base: APPLAUSE_BASE, accent: APPLAUSE_WARM, brightness: 0.85, pulse: 0, chase: -1 };
    // Aufbau: Lampen im Raum werden heller und flackern im selben, immer schnelleren Raster
    if (scene === "aufbau")
      return { base: pal.dominant, accent: barColor, brightness: 0.3 + 0.6 * build, pulse: flick, chase: -1 };
    const crowd = phrase && !inDrop && !blackout ? crowdProfile(phrase, c.crowdStyle) : null;
    if (crowd && (crowd.lighter > 0.5 || crowd.phones > 0.7)) {
      // zwei langsame, gegeneinander laufende Schwingungen: wirkt wie viele kleine Lichter, nie im Takt
      const shimmer = 0.5 + 0.5 * Math.sin(t / 730) * Math.sin(t / 1310 + 1.7);
      return {
        base: crowd.lighter > 0.5 ? LIGHTER_GLOW : pal.dominant,
        accent: crowd.lighter > 0.5 ? LIGHTER_GLOW : pal.accent,
        brightness: 0.35 + 0.15 * shimmer,
        pulse: 0.15 + 0.35 * shimmer,
        chase: -1,
      };
    }
    return {
      base: pal.dominant,
      accent: barColor,
      // Blackout: Lampen fast aus; Einschlag: volle Helligkeit
      brightness: climax?.phase === "hit" ? 1 : prof.base * (0.6 + energy * 0.4) * (1 - 0.95 * blackout),
      pulse: blackout ? 0 : scene === "intro" || scene === "outro" ? pulse * 0.2 : pulse,
      // Lauflicht über die Lampen beim großen Einsatz: einmal pro Schlag von links nach rechts
      chase: climax?.phase === "hit" && climax.big ? flashPhase : -1,
    };
  }
}
