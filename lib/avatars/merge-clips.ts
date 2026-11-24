import { AnimationClip } from "three";

/**
 * Tänze einer Figur zusammensetzen: Skelett-Spuren aus der gemeinsamen Tanzdatei (für alle Figuren derselben Familie
 * gleich, nur einmal geladen) plus die eigenen Spuren der Figur (Gesicht, Antenne …), Clip für Clip nach Namen.
 * Die Spuren selbst werden nicht kopiert – sie ändern sich nie und dürfen zwischen Figuren geteilt werden.
 */
export function mergeClips(shared: readonly AnimationClip[], own: readonly AnimationClip[]): AnimationClip[] {
  const byName = new Map(own.map((c) => [c.name, c]));
  const merged = shared.map((s) => {
    const o = byName.get(s.name);
    byName.delete(s.name);
    return o ? new AnimationClip(s.name, Math.max(s.duration, o.duration), [...s.tracks, ...o.tracks]) : s;
  });
  // Clips nur in der Figur (ohne Skelett-Anteil) bleiben erhalten
  return [...merged, ...byName.values()];
}
