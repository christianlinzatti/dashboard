import { z } from "zod";

/** Hüte, die der Avatar tragen kann (Formen: components/stage/Accessories.ts) */
export const hats = ["basecap", "muetze", "cowboyhut", "zylinder", "fischerhut"] as const;
export type Hat = (typeof hats)[number];

/**
 * Avatar-Baukasten: was in den Einstellungen je Künstler festgelegt werden kann. Fehlt ein Wert, bleibt die
 * automatische Wahl. „keiner“ = ausdrücklich ohne Hut (auch wo sonst einer gewürfelt würde).
 */
export const lookOverrideSchema = z
  .object({
    hat: z.enum([...hats, "keiner"]).optional(),
    glasses: z.boolean().optional(),
    headphones: z.boolean().optional(),
    /** Statur 0,9 (klein) … 1,12 (groß) */
    height: z.number().min(0.9).max(1.12).optional(),
  })
  .strict();
export type LookOverride = z.infer<typeof lookOverrideSchema>;

/** Farbe der Leuchtstreifen (#rrggbb) */
export const trimColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);
