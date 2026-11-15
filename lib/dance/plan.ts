import { avatarById, timeScaleFor } from "@/lib/avatars/catalog";
import type { CastMember, Section, SectionKind, SongStatic } from "@/lib/song-context/schema";
import { contiguous } from "@/lib/song-context/sections";

export { contiguous };
import { ENERGY_CLIPS, IDLE_CLIP, WAVE_CLIP, genreBias, type Energy } from "./clips";
import { mixamoClips, mixamoForEnergy, mixamoGenreBias, mixamoOffStyle } from "./mixamo";
import { slots, type Formation, type Vec2 } from "./formations";
import { rng } from "./rng";

export type CameraPreset =
  | "totale"
  | "halbnah"
  | "untersicht"
  | "seite"
  /** Nahaufnahme des aktiven Sängers */
  | "nah"
  /** 360°-Fahrt einmal um die Bühne (über die ganze Phrase) */
  | "kreisfahrt"
  /** hoch von oben */
  | "vogel"
  /** langsame Fahrt von der Totale auf die Tänzer zu */
  | "zoom";

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
  /** alle tanzen denselben Clip synchron */
  sync: boolean;
  formation: Formation;
  camera: CameraPreset;
  /** Drehbühne: Podest mit Tänzern dreht sich während der Phrase einmal um 360° */
  turn: boolean;
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
};

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
  chorus: ["untersicht", "totale", "kreisfahrt", "vogel"],
  bridge: ["nah", "seite", "kreisfahrt"],
  instrumental: ["totale", "seite", "untersicht", "kreisfahrt", "vogel"],
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
export function planChoreography(song: SongStatic, bpm: number): Choreography {
  const timeScale = timeScaleFor(bpm);
  const beatMs = 500 / timeScale; // ein Tanz-Schlag (Clips: 1 Schlag = 0,5 s bei 120 BPM)
  const barMs = beatMs * 4;
  const r = rng(`${song.trackKey}:${Math.round(bpm)}`);
  // eigener Zufall für die Drehbühne – ändert die übrige Choreografie nicht
  const rTurn = rng(`${song.trackKey}:drehbuehne`);
  const genres = song.music.genres.length ? song.music.genres : song.artists.flatMap((a) => a.genres);
  const bias = genreBias(genres);
  mixamoGenreBias(genres).forEach((c) => bias.add(c));
  // passender Stil doppelt so oft, fremder Stil (z. B. Breakdance bei Swing) seltener
  const offStyle = mixamoOffStyle(genres);
  const weightOf = (c: string) => (bias.has(c) ? 2 : offStyle.has(c) ? 0.35 : 1);
  // Mixamo-Tänze passen auf alle Avatare (gemeinsames Skelett) und kommen zu den eingebauten Clips dazu
  const clipsFor = (e: Energy) => [...ENERGY_CLIPS[e], ...mixamoForEnergy(e)];

  const cast = [...song.cast].sort((a, b) => rankOf(a) - rankOf(b) || Math.abs(a.position) - Math.abs(b.position));
  const order = cast.map((c) => c.avatarId);
  const clipsOf = (id: string) => new Set([...(avatarById.get(id)?.clips ?? []), ...mixamoClips.map((c) => c.id)]);
  const available = Object.fromEntries(order.map((id) => [id, clipsOf(id)]));
  const recent: Record<string, string[]> = Object.fromEntries(order.map((id) => [id, []]));

  const sections = song.lyrics?.sections.length
    ? contiguous(song.lyrics.sections, song.track.durationMs)
    : fallbackSections(song.track.durationMs, barMs);

  const phrases: Phrase[] = [];
  let prevFormation: Formation | undefined;

  for (const sec of sections) {
    let t = sec.startMs;
    while (t < sec.endMs - 1) {
      const bars = r.weighted([
        [8, 2],
        [16, 1],
      ] as const);
      let end = Math.min(t + bars * barMs, sec.endMs);
      if (sec.endMs - end < 4 * barMs) end = sec.endMs; // kurze Reste anhängen
      const energy = energyFor(sec.kind, song);
      const sync = sec.kind === "chorus" || (sec.kind === "instrumental" && energy >= 3);
      const formationOptions = FORMATIONS[sec.kind].filter((f) => f !== prevFormation || FORMATIONS[sec.kind].length === 1);
      const formation = r.pick(formationOptions);
      prevFormation = formation;
      const camera = r.pick(CAMERAS[sec.kind]);
      // nicht zusammen mit Kreisfahrt (hebt sich auf) oder Nahaufnahme (Sänger dreht sich weg)
      const turn =
        rTurn.next() < (TURN_CHANCE[sec.kind] ?? 0) && camera !== "kreisfahrt" && camera !== "nah" && end - t >= 4 * barMs;

      const pool = (id: string, avoid: string[]) => {
        const all = clipsFor(energy).filter((c) => available[id]!.has(c));
        const fresh = all.filter((c) => !avoid.includes(c));
        return (fresh.length ? fresh : all).map((c) => [c, weightOf(c)] as const);
      };

      const moves: Record<string, string> = {};
      if (sync) {
        const common = clipsFor(energy).filter((c) => order.every((id) => available[id]!.has(c)));
        const lead = order[0]!;
        const fresh = common.filter((c) => !recent[lead]!.includes(c));
        const clip = r.weighted((fresh.length ? fresh : common).map((c) => [c, weightOf(c)] as const));
        order.forEach((id) => (moves[id] = clip));
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
      phrases.push({
        startMs: t,
        endMs: end,
        section: sec.kind,
        energy,
        sync,
        formation,
        camera,
        turn,
        moves: Object.fromEntries(
          order.map((id, i) => {
            const clip = moves[id]!;
            const offsetBeats = sync || i === 0 ? 0 : r.pick([0, 2, 4]);
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

  return { trackKey: song.trackKey, bpm, beatMs, barMs, timeScale, phrases, order };
}

function rankOf(c: CastMember) {
  return c.role === "lead" ? 0 : c.role === "feature" ? 1 : 2;
}
