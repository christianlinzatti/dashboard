import type { CastMember } from "@/lib/song-context/schema";
import { hash } from "./casting";

/**
 * Outfits: Farbvarianten der Avatare. Alle Modelle haben dieselben benannten Materialien ohne Texturen
 * (Anzug, Rüstung, Leuchtstreifen) – ein Outfit färbt sie zur Laufzeit um. So entstehen aus 11 Modellen
 * viele verschiedene Looks, ohne neue Modelldateien.
 */
export type Outfit = { id: string; label: string; suit: string; armor: string };

export const OUTFITS: Outfit[] = [
  { id: "glut", label: "Glut", suit: "#8f2b1c", armor: "#f1c7a0" },
  { id: "eis", label: "Eis", suit: "#2b639c", armor: "#e2f4ff" },
  { id: "gold", label: "Gold", suit: "#70591a", armor: "#f0cf73" },
  { id: "wald", label: "Wald", suit: "#236b45", armor: "#d3ead0" },
  { id: "violett", label: "Violett", suit: "#5c2fa0", armor: "#e7d6ff" },
  { id: "weiss", label: "Bühnenweiß", suit: "#dfe1ea", armor: "#ffffff" },
  { id: "nacht", label: "Nacht", suit: "#17171c", armor: "#4a4a55" },
];
export const outfitById = new Map(OUTFITS.map((o) => [o.id, o]));

/** Welches Material welche Rolle hat (Namen aus den Modellen, z. B. „Midnight stage suit.007“) */
export function materialRole(name: string): "suit" | "armor" | "trim" | undefined {
  if (/stage suit/i.test(name)) return "suit";
  if (/armor/i.test(name)) return "armor";
  if (/luminous trim/i.test(name)) return "trim";
  return undefined;
}

/** Outfit eines Künstlers: immer dasselbe für denselben Künstler; etwa jeder Vierte tritt im Original auf. */
export function outfitForArtist(artistId: string): string | undefined {
  const i = hash(`outfit:${artistId}`) % (OUTFITS.length + 2);
  return OUTFITS[i]?.id;
}

/**
 * Besetzung einkleiden: Künstler bekommen ihr Outfit und Leuchtstreifen in ihrer Farbe (wie Namensschild und
 * Lyrics); die Background-Tänzer tragen als Crew das Outfit und die Farbe des Leads.
 */
export function dressCast<T extends Omit<CastMember, "outfit" | "trim">>(
  cast: T[],
  artists: Array<{ spotifyId: string; color: string }>,
): Array<T & Pick<CastMember, "outfit" | "trim">> {
  const colorOf = new Map(artists.map((a) => [a.spotifyId, a.color]));
  const lead = cast.find((c) => c.role === "lead" && c.artistId) ?? cast.find((c) => c.artistId);
  const leadLook = lead?.artistId ? { outfit: outfitForArtist(lead.artistId), trim: colorOf.get(lead.artistId) } : {};
  return cast.map((c) => {
    const look = c.artistId ? { outfit: outfitForArtist(c.artistId), trim: colorOf.get(c.artistId) } : leadLook;
    return { ...c, ...(look.outfit ? { outfit: look.outfit } : {}), ...(look.trim ? { trim: look.trim } : {}) };
  });
}
