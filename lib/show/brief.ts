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
export const crowdModes = ["handys", "wiegen", "haende", "springen"] as const;
export type CrowdMode = (typeof crowdModes)[number];
export const moods = ["ruhig", "mittel", "energetisch"] as const;
export type Mood = (typeof moods)[number];

export const showBriefSchema = z.object({
  stage: z.enum(themeIds),
  mood: z.enum(moods),
  genres: z.array(z.string()),
  /** ein kurzer Satz zur Idee der Show (Deutsch) */
  motto: z.string(),
  sections: z.array(
    z.object({
      kind: z.enum(briefSectionKinds),
      energy: z.enum(briefEnergies),
      lyrics: z.enum(lyricsEffects),
      crowd: z.enum(crowdModes),
      effects: z.array(z.enum(effectKinds)),
    }),
  ),
});
export type ShowBrief = z.infer<typeof showBriefSchema>;
export type BriefSection = ShowBrief["sections"][number];

export const energyLevel = (e: BriefSection["energy"]) => briefEnergies.indexOf(e) as 0 | 1 | 2 | 3;

/** Anweisung für eine Abschnittsart (erste passende) */
export function briefFor(brief: ShowBrief | undefined, kind: BriefSection["kind"]): BriefSection | undefined {
  return brief?.sections.find((s) => s.kind === kind);
}

/** Brief von außen (Cache, KI) säubern: Grenzen setzen, doppelte Abschnitte entfernen */
export function sanitizeBrief(raw: unknown): ShowBrief | null {
  const p = showBriefSchema.safeParse(raw);
  if (!p.success) return null;
  const seen = new Set<string>();
  return {
    ...p.data,
    genres: [...new Set(p.data.genres.map((g) => g.trim().toLowerCase()).filter(Boolean))].slice(0, 6),
    motto: p.data.motto.replace(/\s+/g, " ").trim().slice(0, 160),
    sections: p.data.sections
      .filter((s) => !seen.has(s.kind) && seen.add(s.kind))
      .map((s) => ({ ...s, effects: [...new Set(s.effects)].slice(0, 4) })),
  };
}
