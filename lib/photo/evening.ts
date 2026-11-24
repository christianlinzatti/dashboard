/**
 * Erinnerungsfotos des Abends (im Browser): die Adressen der hochgeladenen Fotos, damit der Rückblick sie gesammelt
 * teilen kann. Fotos sind 24 h abrufbar – ältere fallen weg, und nach sechs Stunden Pause beginnt ein neuer Abend.
 */
const STORAGE_KEY = "ss_fotos_abend";
export const PHOTO_LIFETIME_MS = 24 * 3600_000;
const NEW_EVENING_MS = 6 * 3600_000;
const MAX = 30;

export type EveningPhoto = { id: string; at: number };

/** Fotos des laufenden Abends: noch abrufbar und ohne lange Pause dazwischen (neueste zuletzt) */
export function currentEvening(list: readonly EveningPhoto[], now: number): EveningPhoto[] {
  const alive = list.filter((p) => now - p.at < PHOTO_LIFETIME_MS).sort((a, b) => a.at - b.at);
  let start = 0;
  for (let i = 1; i < alive.length; i++) if (alive[i]!.at - alive[i - 1]!.at > NEW_EVENING_MS) start = i;
  // ist auch das letzte Foto schon lange her, ist der Abend vorbei – dann gilt er trotzdem, bis die Fotos ablaufen
  return alive.slice(start).slice(-MAX);
}

export function loadEveningPhotos(): EveningPhoto[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(raw)
      ? (raw as EveningPhoto[]).filter((p) => p && typeof p.id === "string" && typeof p.at === "number")
      : [];
  } catch {
    return [];
  }
}

export function rememberPhoto(id: string, now = Date.now()) {
  const list = currentEvening([...loadEveningPhotos(), { id, at: now }], now);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* privater Modus: dann keine Galerie */
  }
}
