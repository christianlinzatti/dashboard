import { z } from "zod";
import { lyricsEffects } from "@/lib/lyrics/director";
import { effectKinds, themeIds } from "@/lib/stage/themes";

/**
 * Regieanweisung für einen Song („Show-Brief“): kommt von der KI-Regie (/api/show) und überlagert die
 * eingebauten Regeln – Bühne, Stimmung, Genres und je Abschnitt Energie, Schrift-Effekt, Publikum, Effekte.
 * Alles optional: ohne Brief laufen die deterministischen Regeln wie bisher.
 */
export const briefSectionKinds = ["intro", "verse", "prechorus", "chorus", "bridge", "instrumental", "outro"] as const;
export const briefEnergies = ["ruhig", "mittel", "hoch", "hoehepunkt"] as const;
export const crowdModes = ["handys", "wiegen", "haende", "klatschen", "springen", "moshpit", "feuerzeuge", "welle"] as const;
export type CrowdMode = (typeof crowdModes)[number];
export const moods = ["ruhig", "mittel", "energetisch"] as const;
/**
 * Choreografie-Moment eines Abschnitts: synchron (alle gleich), kanon (gleicher Tanz als Welle über die Bühne),
 * solo (Lead im Spot, Crew hält still), frei (jeder tanzt anders).
 */
export const showMoments = ["synchron", "kanon", "solo", "frei"] as const;
export type ShowMoment = (typeof showMoments)[number];
export type Mood = (typeof moods)[number];

const sectionCore = z.object({
  kind: z.enum(briefSectionKinds),
  energy: z.enum(briefEnergies),
  lyrics: z.enum(lyricsEffects),
  crowd: z.enum(crowdModes),
  effects: z.array(z.enum(effectKinds)),
});
const briefCore = {
  stage: z.enum(themeIds),
  mood: z.enum(moods),
  genres: z.array(z.string()),
  /** Motto der Show (Deutsch, kurz) – Einblendung zum Songstart, Alexa */
  motto: z.string(),
};

/** Ansage des Sängers zum Songstart je Abendphase (Deutsch, ein Satz; `{s}` = Heimatort, wird ersetzt) */
export const announcementsSchema = z.object({
  auftakt: z.string(),
  steigerung: z.string(),
  hoehepunkt: z.string(),
  durchatmen: z.string(),
  zugabe: z.string(),
});
export type Announcements = z.infer<typeof announcementsSchema>;

/** Was die KI liefern muss (strukturierte Ausgabe: alle Felder Pflicht) */
export const showBriefSchema = z.object({
  ...briefCore,
  sections: z.array(sectionCore.extend({ moment: z.enum(showMoments) })),
  announcements: announcementsSchema,
});
/** Was gespeichert/gelesen wird: ältere Briefs (Cache) haben noch keinen Moment und keine Ansagen – dann die Regeln */
export const storedBriefSchema = z.object({
  ...briefCore,
  sections: z.array(sectionCore.extend({ moment: z.enum(showMoments).optional() })),
  announcements: announcementsSchema.partial().optional(),
});

/** Ansage aufräumen: ein Satz, nicht zu lang, keine fremden Platzhalter oder Anführungszeichen außen herum */
export function cleanAnnouncement(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw
    .replace(/\s+/g, " ")
    .replace(/\{(?!s\})[^}]*\}/g, "")
    .trim()
    .replace(/^["\u201E\u201C\u2018']+|["\u201C\u201D\u2019']+$/g, "")
    .trim();
  return t.length >= 8 && t.length <= 140 ? t : undefined;
}
export type ShowBrief = z.infer<typeof storedBriefSchema>;
export type BriefSection = ShowBrief["sections"][number];

export const energyLevel = (e: BriefSection["energy"]) => briefEnergies.indexOf(e) as 0 | 1 | 2 | 3;

/** Anweisung für eine Abschnittsart (erste passende) */
export function briefFor(brief: ShowBrief | undefined, kind: BriefSection["kind"]): BriefSection | undefined {
  return brief?.sections.find((s) => s.kind === kind);
}

/** Brief von außen (Cache, KI) säubern: Grenzen setzen, doppelte Abschnitte entfernen */
export function sanitizeBrief(raw: unknown): ShowBrief | null {
  const p = storedBriefSchema.safeParse(raw);
  if (!p.success) return null;
  const seen = new Set<string>();
  return {
    ...p.data,
    genres: [...new Set(p.data.genres.map((g) => g.trim().toLowerCase()).filter(Boolean))].slice(0, 6),
    motto: p.data.motto.replace(/\s+/g, " ").trim().slice(0, 160),
    ...(p.data.announcements
      ? {
          announcements: Object.fromEntries(
            Object.entries(p.data.announcements)
              .map(([k, v]) => [k, cleanAnnouncement(v)] as const)
              .filter(([, v]) => v !== undefined),
          ),
        }
      : {}),
    sections: p.data.sections
      .filter((s) => !seen.has(s.kind) && seen.add(s.kind))
      .map((s) => ({ ...s, effects: [...new Set(s.effects)].slice(0, 4) })),
  };
}
