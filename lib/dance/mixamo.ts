import catalog from "./mixamo-clips.json";
import type { Energy } from "./clips";

/**
 * Katalog der umgewandelten Mixamo-Tänze (`npm run mixamo`, siehe docs/MIXAMO.md).
 * Einträge ohne `file` sind Vorschläge, deren FBX noch nicht heruntergeladen/umgewandelt wurde.
 */
export type MixamoEntry = {
  id: string;
  /** Dateiname der heruntergeladenen FBX in ./mixamo (nicht im Repo) */
  source: string;
  /** Mixamo-Suchbegriff, unter dem der Tanz zu finden ist */
  search: string;
  energy: Energy;
  /** Genre-Stichwörter (Teilwort, ohne Groß-/Kleinschreibung), bei denen der Tanz bevorzugt wird */
  genres: string[];
  /** eingebauter Clip, solange der Mixamo-Clip lädt oder fehlt */
  fallback: string;
  /** Tempo der Aufnahme; leer = geschätzt */
  bpm?: number | null;
  /** Ausschnitt der Aufnahme in Sekunden */
  start?: number;
  end?: number | null;
  /** vom Umwandlungsskript gesetzt */
  file?: string;
  beats?: number;
  detectedBpm?: number;
  /** automatisch aus einer FBX ohne Katalogeintrag aufgenommen: Energie wird bei jeder Umwandlung neu gemessen */
  auto?: boolean;
  /** nicht in der Choreografie verwenden (z. B. Übergänge wie „Footwork To Idle“, die als Schleife seltsam wirken) */
  skip?: boolean;
  /** derselbe Tanz wie dieser Eintrag (doppelt heruntergeladen) – wird nicht umgewandelt */
  duplicateOf?: string;
  /** Grund für skip (automatisch gesetzt: „Übergang“, „kein Tanz“) */
  skipReason?: string;
  /**
   * früher umgewandelter Tanz, dessen FBX-Name inzwischen einen anderen Tanz enthält (z. B. neu nummerierte
   * Downloads) – Clip bleibt erhalten, wird aber keiner FBX mehr zugeordnet
   */
  preserved?: boolean;
};

export const MIXAMO: MixamoEntry[] = (catalog.clips as MixamoEntry[]).map((c) => ({ ...c }));

/** Nur Tänze, die wirklich umgewandelt im Repo liegen. */
export const mixamoClips = MIXAMO.filter((c): c is MixamoEntry & { file: string } => !!c.file && !c.skip);

/** Übergänge, Anfänge und Schlussposen – als Schleife ungeeignet */
export function isTransition(name: string): boolean {
  return /\b(to (idle|ground|freeze|stand)|ending|end|start|ready|idle)\b/i.test(name);
}

const GENERIC = new Set(["pop", "dance", "party", "festival"]);

/**
 * Mixamo-Tänze mit eigenem Stil, der nicht zum Song passt (z. B. Breakdance bei Swing) – werden seltener gewählt,
 * damit ein großer Katalog eines Stils nicht jede Choreografie prägt.
 */
export function mixamoOffStyle(genres: string[]): Set<string> {
  const match = new Set(mixamoGenreBias(genres));
  return new Set(
    mixamoClips.filter((c) => !match.has(c.id) && c.genres.some((g) => !GENERIC.has(g.toLowerCase()))).map((c) => c.id),
  );
}

export const mixamoById = new Map(mixamoClips.map((c) => [c.id, c]));

/**
 * Alle umgewandelten Clips – auch solche, die nicht getanzt werden (Gehen, Winken …). Die Bühne nutzt einige
 * davon für Auftritt und Abgang (siehe STAGE_CLIPS in lib/dance/evaluate.ts).
 */
export const mixamoFileById = new Map(MIXAMO.filter((c): c is MixamoEntry & { file: string } => !!c.file).map((c) => [c.id, c]));

export function mixamoForEnergy(e: Energy): string[] {
  return mixamoClips.filter((c) => c.energy === e).map((c) => c.id);
}

export function mixamoGenreBias(genres: string[]): string[] {
  const g = genres.map((x) => x.toLowerCase());
  return mixamoClips.filter((c) => c.genres.some((w) => g.some((x) => x.includes(w.toLowerCase())))).map((c) => c.id);
}

/** Eingebauter Ersatz für einen Clip-Namen (Mixamo-Clip noch nicht geladen). */
export function fallbackFor(clip: string): string | undefined {
  return mixamoById.get(clip)?.fallback;
}
