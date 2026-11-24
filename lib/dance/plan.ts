import { avatarById, timeScaleFor } from "@/lib/avatars/catalog";
import type { CastMember, Section, SectionKind, SongStatic } from "@/lib/song-context/schema";
import { contiguous } from "@/lib/song-context/sections";

export { contiguous };
import { ENERGY_CLIPS, IDLE_CLIP, WAVE_CLIP, genreBias, type Energy } from "./clips";
import { mixamoClips, mixamoForEnergy, mixamoGenreBias, mixamoOffStyle } from "./mixamo";
import { briefFor, energyLevel, type CrowdMode, type ShowMoment } from "@/lib/show/brief";
import type { EffectKind } from "@/lib/stage/themes";
import { slots, type Formation, type Vec2 } from "./formations";
import { planClimaxes, type Climax } from "@/lib/stage/climax";
import { bandKind, type BandKind, type BandRole } from "@/lib/stage/band";
import { rng } from "./rng";
import { crowdProfile } from "@/lib/stage/crowd";
import { planSingAlong, type SingAlong } from "@/lib/show/singalong";
import { trustedDrops } from "@/lib/song-memory/memory";
import { sectionsFromEnergy } from "@/lib/song-memory/energy-sections";

export type CameraPreset =
  | "totale"
  | "halbnah"
  | "untersicht"
  | "seite"
  /** Nahaufnahme des aktiven Sängers */
  | "nah"
  /** Band-Solo: von schräg oben über die Köpfe der Tänzer auf den Musiker hinten auf dem Podest */
  | "solo"
  /** 360°-Fahrt einmal um die Bühne (über die ganze Phrase) */
  | "kreisfahrt"
  /** hoch von oben */
  | "vogel"
  /** langsame Fahrt von der Totale auf die Tänzer zu */
  | "zoom"
  /** aus dem Publikum: über die Köpfe auf die Bühne */
  | "ueberkopf"
  /** Kamerakran: steigt über die Phrase vom Publikum hoch über die Bühne (im Outro: zieht sich zurück) */
  | "kran";

/** Choreografie-Moment: synchron, Kanon (gleicher Tanz als Welle), Solo (Lead im Spot), frei */
export type Moment = ShowMoment;

export type Move = {
  clip: string;
  /** Songzeit, ab der dieser Clip läuft (bleibt über Phrasen gleich, wenn der Clip weiterläuft) */
  clipStartMs: number;
  /** Kanon-Versatz in Schlägen */
  offsetBeats: number;
};

export type Phrase = {
  startMs: number;
  endMs: number;
  section: SectionKind;
  energy: Energy;
  /** alle tanzen denselben Clip synchron (moment „synchron“) */
  sync: boolean;
  /** wie die Tänzer zusammen tanzen */
  moment: Moment;
  formation: Formation;
  camera: CameraPreset;
  /** zweite Einstellung für Schnitte (bei hoher Energie alle 4 Takte hart zwischen beiden wechseln) */
  cut?: CameraPreset;
  /** Regieanweisung (KI): was das Publikum tut und welche Effekte beim Einsatz zünden */
  crowd?: CrowdMode;
  effects?: EffectKind[];
  /** Drehbühne: Podest mit Tänzern dreht sich während der Phrase einmal um 360° */
  turn: boolean;
  /** Band-Solo (Instrumentalteil mit Schwung): Kamera und Spot auf diesen Musiker, er tritt nach vorn */
  solo?: BandRole;
  moves: Record<string, Move>;
  positions: Record<string, Vec2>;
};

export type Choreography = {
  trackKey: string;
  bpm: number;
  beatMs: number;
  barMs: number;
  timeScale: number;
  phrases: Phrase[];
  /** Avatar-IDs in Rangfolge (Lead zuerst) */
  order: string[];
  /** Höhepunkte (Refrain-Einsätze, Finale) – siehe lib/stage/climax.ts */
  climaxes: Climax[];
  /** Songlänge (Abgang: Winken und Verbeugung in den letzten Takten) */
  durationMs: number;
  /** Publikum: Moshpit bei Rock, Feuerzeuge bei Balladen */
  crowdStyle: CrowdStyle;
  /** Mitsing-Moment im letzten Refrain (lib/show/singalong.ts) */
  singAlong?: SingAlong | null;
  /** aus dem Song-Gedächtnis bekannte Drops (Songzeit) – wirken wie live gemessene, nur punktgenau */
  knownDrops?: number[];
};

export type CrowdStyle = "rock" | "ballade" | null;

/** Einstellungen, die stehen (kein Fahrt) – nur zwischen diesen wird geschnitten */
export const STATIC_SHOTS: CameraPreset[] = ["totale", "halbnah", "untersicht", "seite", "vogel", "ueberkopf"];

const BASE_ENERGY: Record<SectionKind, Energy> = {
  intro: 0,
  verse: 1,
  prechorus: 2,
  chorus: 2,
  bridge: 1,
  instrumental: 2,
  outro: 0,
};

const FORMATIONS: Record<SectionKind, Formation[]> = {
  intro: ["halbkreis", "linie"],
  verse: ["v", "spotlight", "v"],
  prechorus: ["v", "linie"],
  chorus: ["linie", "halbkreis"],
  bridge: ["spotlight", "halbkreis"],
  instrumental: ["halbkreis", "linie", "v"],
  outro: ["linie"],
};

const CAMERAS: Record<SectionKind, CameraPreset[]> = {
  intro: ["zoom", "totale"],
  verse: ["halbnah", "nah", "totale", "seite", "nah"],
  prechorus: ["halbnah", "seite", "zoom"],
  chorus: ["untersicht", "totale", "kreisfahrt", "vogel", "kran"],
  bridge: ["nah", "seite", "kreisfahrt"],
  instrumental: ["totale", "seite", "untersicht", "kreisfahrt", "vogel", "kran"],
  outro: ["totale"],
};

/** Abschnitte, in denen sich die Drehbühne drehen darf (Anteil der Phrasen) */
const TURN_CHANCE: Partial<Record<SectionKind, number>> = { chorus: 0.4, instrumental: 0.5, bridge: 0.35 };

/** Ohne Lyrics: Abschnitte aus der Songdauer schätzen (Intro, Wechsel mittel/hoch, Outro). */
export function fallbackSections(durationMs: number, barMs: number): Section[] {
  const out: Section[] = [];
  const intro = Math.min(8 * barMs, durationMs * 0.15);
  const outro = Math.max(durationMs - 16 * barMs, intro);
  out.push({ kind: "intro", startMs: 0, endMs: intro });
  let t = intro;
  let i = 0;
  while (t < outro) {
    const end = Math.min(t + 16 * barMs, outro);
    out.push({ kind: i++ % 2 === 0 ? "verse" : "instrumental", startMs: t, endMs: end });
    t = end;
  }
  if (outro < durationMs) out.push({ kind: "outro", startMs: outro, endMs: durationMs });
  return out;
}

function energyFor(kind: SectionKind, song: SongStatic): Energy {
  // die Regie (KI) kennt den Song: ihre Energie je Abschnitt geht vor
  const directed = briefFor(song.show, kind);
  if (directed) return energyLevel(directed.energy);
  let e = BASE_ENERGY[kind] as number;
  if (song.music.mood === "energetisch" && kind !== "intro" && kind !== "outro") e++;
  if (song.music.mood === "ruhig") e--;
  return Math.min(Math.max(e, 0), 3) as Energy;
}

/**
 * Plant die Choreografie eines Songs: Phrasen von 8/16 Takten (und an jedem Abschnittswechsel),
 * Clip pro Tänzer mit Wiederholungssperre, Refrains synchron, sonst Varianten mit Kanon,
 * wechselnde Formationen und Kameraeinstellungen. Deterministisch pro Track.
 */
export function planChoreography(
  song: SongStatic,
  bpm: number,
  opts: {
    /** Tänze der letzten Songs des Abends – werden seltener gewählt (Abwechslung über die Setlist) */
    avoidClips?: ReadonlySet<string>;
  } = {},
): Choreography {
  const timeScale = timeScaleFor(bpm);
  const beatMs = 500 / timeScale; // ein Tanz-Schlag (Clips: 1 Schlag = 0,5 s bei 120 BPM)
  const barMs = beatMs * 4;
  // Tagesform (variant): gleicher Song, an einem anderen Tag andere Auswahl
  const variant = song.variant ? `:${song.variant}` : "";
  const r = rng(`${song.trackKey}:${Math.round(bpm)}${variant}`);
  // eigener Zufall für die Drehbühne – ändert die übrige Choreografie nicht
  const rTurn = rng(`${song.trackKey}:drehbuehne${variant}`);
  // eigener Zufall für die Momente (synchron/Kanon/Solo/frei)
  const rMoment = rng(`${song.trackKey}:moment${variant}`);
  // eigener Zufall für Schnitte und Publikumsperspektive (ändert sonst nichts)
  const rCam = rng(`${song.trackKey}:schnitt${variant}`);
  const avoid = opts.avoidClips;
  const genres = song.music.genres.length ? song.music.genres : song.artists.flatMap((a) => a.genres);
  const bias = genreBias(genres);
  mixamoGenreBias(genres).forEach((c) => bias.add(c));
  // passender Stil doppelt so oft, fremder Stil (z. B. Breakdance bei Swing) seltener
  const offStyle = mixamoOffStyle(genres);
  const weightOf = (c: string) => (bias.has(c) ? 2 : offStyle.has(c) ? 0.35 : 1) * (avoid?.has(c) ? 0.25 : 1);
  // Mixamo-Tänze passen auf alle Avatare (gemeinsames Skelett) und kommen zu den eingebauten Clips dazu
  const clipsFor = (e: Energy) => [...ENERGY_CLIPS[e], ...mixamoForEnergy(e)];

  const cast = [...song.cast].sort((a, b) => rankOf(a) - rankOf(b) || Math.abs(a.position) - Math.abs(b.position));
  const order = cast.map((c) => c.avatarId);
  const clipsOf = (id: string) => new Set([...(avatarById.get(id)?.clips ?? []), ...mixamoClips.map((c) => c.id)]);
  const available = Object.fromEntries(order.map((id) => [id, clipsOf(id)]));
  const recent: Record<string, string[]> = Object.fromEntries(order.map((id) => [id, []]));

  const sections = song.lyrics?.sections.length
    ? contiguous(song.lyrics.sections, song.track.durationMs)
    : // ohne Lyrics-Abschnitte: aus dem gemessenen Energieverlauf (Song-Gedächtnis), sonst nach der Songlänge geschätzt
      (song.memory?.energy && sectionsFromEnergy(song.memory.energy, song.track.durationMs, barMs)) ||
      fallbackSections(song.track.durationMs, barMs);

  const phrases: Phrase[] = [];
  let prevFormation: Formation | undefined;
  // Band (nach Genre): Instrumentalteile mit Schwung werden zum Solo eines Musikers
  const band = bandKind(genres);
  let solos = 0;

  for (const sec of sections) {
    let t = sec.startMs;
    let inSection = 0;
    while (t < sec.endMs - 1) {
      const bars = r.weighted([
        [8, 2],
        [16, 1],
      ] as const);
      let end = Math.min(t + bars * barMs, sec.endMs);
      if (sec.endMs - end < 4 * barMs) end = sec.endMs; // kurze Reste anhängen
      const energy = energyFor(sec.kind, song);
      const isFirst = phrases.length === 0;
      const moment =
        isFirst && sec.kind === "intro"
          ? "frei"
          : momentFor(sec.kind, energy, inSection, rMoment, briefFor(song.show, sec.kind)?.moment);
      inSection++;
      const sync = moment === "synchron";
      const formationOptions = FORMATIONS[sec.kind].filter((f) => f !== prevFormation || FORMATIONS[sec.kind].length === 1);
      let formation = r.pick(formationOptions);
      let camera = r.pick(CAMERAS[sec.kind]);
      if (moment === "solo") {
        // Solo: Lead vorne im Spot, Kamera bleibt nah dran
        formation = "spotlight";
        if (!["nah", "halbnah", "zoom"].includes(camera)) camera = rMoment.pick(["nah", "halbnah"] as const);
      }
      prevFormation = formation;
      const solo = sec.kind === "instrumental" && energy >= 2 && band ? soloRole(band, solos++) : undefined;
      if (solo) camera = "solo"; // auf den Solisten (Director richtet sie auf ihn aus)
      // Aus dem Publikum: manchmal statt der Totale über die Köpfe filmen
      if (camera === "totale" && (sec.kind === "chorus" || sec.kind === "instrumental") && rCam.next() < 0.4)
        camera = "ueberkopf";
      // nicht zusammen mit Kreisfahrt (hebt sich auf) oder Nahaufnahme (Sänger dreht sich weg)
      const turn =
        moment !== "solo" &&
        rTurn.next() < (TURN_CHANCE[sec.kind] ?? 0) &&
        camera !== "kreisfahrt" &&
        camera !== "kran" &&
        camera !== "nah" &&
        camera !== "solo" &&
        end - t >= 4 * barMs;

      const pool = (id: string, avoid: string[]) => {
        const all = clipsFor(energy).filter((c) => available[id]!.has(c));
        const fresh = all.filter((c) => !avoid.includes(c));
        return (fresh.length ? fresh : all).map((c) => [c, weightOf(c)] as const);
      };

      const moves: Record<string, string> = {};
      if (moment === "synchron" || moment === "kanon") {
        const common = clipsFor(energy).filter((c) => order.every((id) => available[id]!.has(c)));
        const lead = order[0]!;
        const fresh = common.filter((c) => !recent[lead]!.includes(c));
        const clip = r.weighted((fresh.length ? fresh : common).map((c) => [c, weightOf(c)] as const));
        order.forEach((id) => (moves[id] = clip));
      } else if (moment === "solo") {
        // Lead tanzt, die Crew hält still (atmet nur)
        order.forEach((id, i) => {
          if (i > 0) return (moves[id] = available[id]!.has(IDLE_CLIP) ? IDLE_CLIP : (pool(id, [])[0]?.[0] ?? IDLE_CLIP));
          const opts = pool(id, recent[id]!);
          moves[id] = opts.length ? r.weighted(opts) : IDLE_CLIP;
        });
      } else {
        const used = new Set<string>();
        order.forEach((id, i) => {
          // Beim Songstart winken der Lead und alle Artists, denen du folgst
          const followed = !!song.user?.artists[cast[i]?.artistId ?? ""]?.following;
          if ((i === 0 || followed) && phrases.length === 0 && sec.kind === "intro" && available[id]!.has(WAVE_CLIP))
            return (moves[id] = WAVE_CLIP);
          // Nebenfiguren möglichst andere Variante als die anderen
          const opts = pool(id, [...recent[id]!, ...used]);
          const clip = opts.length ? r.weighted(opts) : IDLE_CLIP;
          used.add(clip);
          moves[id] = clip;
        });
      }

      const prev = phrases.at(-1);
      const s = slots(formation, order.length);
      // Kanon: Welle von links nach rechts – je Platz einen Schlag später
      const leftToRight = order.map((_, i) => i).sort((a, b) => s[a]![0] - s[b]![0]);
      const kanonBeats = (i: number) => leftToRight.indexOf(i);
      phrases.push({
        startMs: t,
        endMs: end,
        section: sec.kind,
        energy,
        sync,
        moment,
        formation,
        camera,
        // Schnitte: bei hoher Energie, stehender Einstellung und ohne Drehbühne eine zweite Einstellung
        ...(energy >= 2 && !turn && moment !== "solo" && STATIC_SHOTS.includes(camera) && end - t >= 8 * barMs
          ? { cut: rCam.pick(STATIC_SHOTS.filter((x) => x !== camera && x !== "vogel")) }
          : {}),
        turn,
        ...(solo ? { solo } : {}),
        ...directives(song, sec.kind),
        moves: Object.fromEntries(
          order.map((id, i) => {
            const clip = moves[id]!;
            const offsetBeats = moment === "kanon" ? kanonBeats(i) : sync || moment === "solo" || i === 0 ? 0 : r.pick([0, 2, 4]);
            const continues = prev?.moves[id]?.clip === clip && prev.moves[id]!.offsetBeats === offsetBeats;
            return [id, { clip, offsetBeats, clipStartMs: continues ? prev.moves[id]!.clipStartMs : t }];
          }),
        ),
        positions: Object.fromEntries(order.map((id, i) => [id, s[i]!])),
      });

      order.forEach((id) => {
        const list = recent[id]!;
        if (list.at(-1) !== moves[id]) list.push(moves[id]!);
        if (list.length > 4) list.shift();
      });
      t = end;
    }
  }

  const climaxes = planClimaxes(phrases, barMs);
  const kind = band;
  const crowdStyle: CrowdStyle = kind === "rock" ? "rock" : kind === "keys" || song.music.mood === "ruhig" ? "ballade" : null;
  return {
    trackKey: song.trackKey,
    bpm,
    beatMs,
    barMs,
    timeScale,
    phrases: phrases.map((p, i) => farewell(waveShots(p, crowdStyle), i === phrases.length - 1)),
    order,
    climaxes,
    durationMs: song.track.durationMs,
    crowdStyle,
    singAlong: planSingAlong(phrases, climaxes, barMs, song.lyrics),
    knownDrops: trustedDrops(song.memory),
  };
}

/** Letzte Phrase im Outro: der Kran zieht sich nach hinten oben zurück – Abschied von der Bühne */
function farewell(p: Phrase, last: boolean): Phrase {
  if (!last || p.section !== "outro" || p.turn) return p;
  return { ...p, camera: "kran", cut: undefined };
}

/** La-Ola: im Wechsel mit der Bühnen-Einstellung eine weite Einstellung, damit man die Welle durch die Menge sieht */
function waveShots(p: Phrase, style: CrowdStyle): Phrase {
  if (crowdProfile(p, style).wave < 0.5 || p.turn) return p;
  return { ...p, cut: p.camera === "totale" ? "ueberkopf" : "totale" };
}

/**
 * Moment einer Phrase. Regie (KI) gilt für die erste Phrase des Abschnitts; spätere Phrasen variieren
 * (synchron ↔ Kanon, nach einem Solo frei), damit lange Abschnitte nicht erstarren.
 */
export function momentFor(
  kind: SectionKind,
  energy: Energy,
  inSection: number,
  r: { next(): number },
  directed?: Moment,
): Moment {
  const roll = r.next();
  if (directed) {
    if (inSection === 0) return directed;
    if (directed === "synchron") return roll < 0.5 ? "kanon" : "synchron";
    if (directed === "solo") return "frei";
    return directed;
  }
  switch (kind) {
    case "chorus":
      return inSection === 0 ? "synchron" : roll < 0.5 ? "kanon" : "synchron";
    case "instrumental":
      if (energy >= 3) return inSection === 0 ? "synchron" : roll < 0.5 ? "kanon" : "synchron";
      return roll < 0.35 ? "kanon" : "frei";
    case "bridge":
      return inSection === 0 ? (roll < 0.6 ? "solo" : "kanon") : "frei";
    case "verse":
      return inSection === 0 && roll < 0.2 ? "solo" : roll > 0.85 ? "kanon" : "frei";
    case "prechorus":
      return roll < 0.35 ? "kanon" : "frei";
    default:
      return "frei";
  }
}

function directives(song: SongStatic, kind: SectionKind): Pick<Phrase, "crowd" | "effects"> {
  const d = briefFor(song.show, kind);
  return d ? { crowd: d.crowd, effects: d.effects } : {};
}

/** Wer das Solo spielt: Rock abwechselnd Gitarre und Schlagzeug, sonst Keyboard bzw. DJ */
function soloRole(kind: BandKind, n: number): BandRole {
  if (kind === "rock") return n % 2 === 0 ? "gitarre" : "schlagzeug";
  return kind === "keys" ? "keyboard" : "dj";
}

function rankOf(c: CastMember) {
  return c.role === "lead" ? 0 : c.role === "feature" ? 1 : 2;
}
