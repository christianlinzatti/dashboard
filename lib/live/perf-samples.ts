import type { LogEntry } from "./log-schema";

/**
 * Leistungsproben des Kiosks: alle 5 Minuten Mittel und schlechtester Wert der Bildrate (gemessen alle 2 s), dazu
 * Qualitätsstufe und Bühne. Sie laufen über das Kiosk-Protokoll (`/api/log`, Quelle „leistung“) als lesbarer Text –
 * hier geschrieben und wieder gelesen, damit /debug sie je Bühne und Stufe auswerten kann.
 */
export type PerfSample = { at: number; fps: number; minFps: number; quality: string; theme: string };

export function perfMessage(s: Omit<PerfSample, "at">, size: string): string {
  return `${s.fps} fps (min ${s.minFps}), Qualität ${s.quality}, Bühne ${s.theme}, ${size}`;
}

/** Liest eine Probe aus dem Protokoll; ältere Proben ohne Mindestwert und Bühne zählen als „?“ */
export function parsePerfSample(e: Pick<LogEntry, "source" | "message" | "at">): PerfSample | null {
  if (e.source !== "leistung") return null;
  const fps = e.message.match(/^(\d+) fps/);
  if (!fps) return null;
  const min = e.message.match(/\(min (\d+)\)/);
  return {
    at: e.at,
    fps: Number(fps[1]),
    minFps: min ? Number(min[1]) : Number(fps[1]),
    quality: e.message.match(/Qualität (\w+)/)?.[1] ?? "?",
    theme: e.message.match(/Bühne ([\w-]+)/)?.[1] ?? "?",
  };
}

export type PerfGroup = { theme: string; quality: string; samples: number; avgFps: number; minFps: number; lastAt: number };

/** Je Bühne und Stufe: Zahl der Proben, mittlere Bildrate, schlechtester Wert, letzte Probe (schwächste zuerst) */
export function summarizePerf(samples: readonly PerfSample[]): PerfGroup[] {
  const groups = new Map<string, PerfSample[]>();
  for (const s of samples) {
    const k = `${s.theme}|${s.quality}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.values()]
    .map((list) => ({
      theme: list[0]!.theme,
      quality: list[0]!.quality,
      samples: list.length,
      avgFps: Math.round(list.reduce((sum, s) => sum + s.fps, 0) / list.length),
      minFps: Math.min(...list.map((s) => s.minFps)),
      lastAt: Math.max(...list.map((s) => s.at)),
    }))
    .sort((a, b) => a.avgFps - b.avgFps);
}

/** Bewertung für die Anzeige: flüssig ab 28 fps, ruckelt sichtbar unter 20 */
export const perfGrade = (fps: number) => (fps >= 28 ? "flüssig" : fps >= 20 ? "knapp" : "ruckelt");

/**
 * Konkrete Empfehlungen aus dem Verlauf (nur Gruppen mit mindestens zwei Proben, also ≥ 10 Minuten Musik):
 * ruckelnde Bühnen eine Stufe tiefer oder – wenn schon „niedrig“ – aus der Auswahl; sehr flüssig auf „mittel“ → „hoch“
 * ausprobieren. Ohne genug Daten ein Hinweis, wie lange es noch dauert.
 */
export function perfAdvice(groups: readonly PerfGroup[]): string[] {
  const solid = groups.filter((g) => g.samples >= 2);
  if (!solid.length) return ["Noch zu wenig Daten – nach etwa 10 Minuten Musik je Bühne gibt es hier Empfehlungen."];
  const out: string[] = [];
  for (const g of solid) {
    if (g.avgFps < 20)
      out.push(
        g.quality === "niedrig"
          ? `Bühne „${g.theme}“ ruckelt selbst auf „niedrig“ (Ø ${g.avgFps} fps) – in den Einstellungen eine andere Bühne wählen.`
          : `Bühne „${g.theme}“ ruckelt auf „${g.quality}“ (Ø ${g.avgFps} fps) – Qualität „niedrig“ einstellen (oder „Automatisch“).`,
      );
    else if (g.minFps < 15)
      out.push(
        `Bühne „${g.theme}“ (${g.quality}) läuft meist ${perfGrade(g.avgFps)}, hat aber Einbrüche bis ${g.minFps} fps – meist beim Songwechsel, wenn neue Figuren laden.`,
      );
  }
  const mittel = solid.filter((g) => g.quality === "mittel");
  if (mittel.length && mittel.every((g) => g.avgFps >= 45 && g.minFps >= 30))
    out.push("Auf „mittel“ läuft alles sehr flüssig – „hoch“ ausprobieren (mehr Lichter, Live-Bildschirme schärfer).");
  return out.length ? out : ["Alles im grünen Bereich – keine Änderung nötig."];
}
