import type { AnimationClip } from "three";
import { report } from "@/lib/live/telemetry";
import { unpackClip, type PackedClip } from "./clip-pack";
import { mixamoById, mixamoFileById } from "./mixamo";
import type { Choreography } from "./plan";
import { STAGE_CLIPS } from "./evaluate";

/**
 * Lädt umgewandelte Mixamo-Clips bei Bedarf (nur die, die der Plan eines Songs verwendet).
 * Schlägt ein Clip fehl, tanzt der Avatar den eingebauten Ersatz-Clip – die Bühne läuft weiter.
 */
const loaded = new Map<string, AnimationClip>();
const pending = new Map<string, Promise<void>>();
const batches = new Map<string, Promise<void>>();

export const loadedMixamo = (id: string) => loaded.get(id);

export function mixamoIdsIn(c: Choreography): string[] {
  const ids = new Set<string>();
  for (const p of c.phrases) for (const m of Object.values(p.moves)) if (mixamoById.has(m.clip)) ids.add(m.clip);
  // Auftritt und Abgang (Gehen, Winken)
  for (const id of STAGE_CLIPS) if (mixamoFileById.has(id)) ids.add(id);
  return [...ids].sort();
}

function loadOne(id: string, fetchImpl: typeof fetch): Promise<void> {
  const entry = mixamoFileById.get(id);
  if (!entry) return Promise.resolve();
  let p = pending.get(id);
  if (!p) {
    p = fetchImpl(entry.file)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PackedClip>;
      })
      .then((packed) => void loaded.set(id, unpackClip(packed)))
      .catch((e: unknown) => {
        pending.delete(id); // später erneut versuchen
        report("warnung", "tanz", `Mixamo-Clip ${id} nicht geladen: ${e instanceof Error ? e.message : String(e)}`);
      });
    pending.set(id, p);
  }
  return p;
}

/** Ein Promise je Clip-Satz (stabil für React `use()`); löst immer auf, auch bei Fehlern. */
export function loadMixamo(ids: string[], fetchImpl: typeof fetch = fetch): Promise<void> {
  const key = ids.join("|");
  let b = batches.get(key);
  if (!b) {
    b = Promise.all(ids.map((id) => loadOne(id, fetchImpl))).then(() => undefined);
    batches.set(key, b); // bleibt gespeichert: dasselbe Promise bei jedem Rendern (sonst Suspense-Schleife)
  }
  return b;
}
