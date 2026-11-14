import type { LyricLine, Section } from "@/lib/song-context/schema";
import { normalizeLine } from "./text";

const BLOCK_GAP_MS = 2500;
const INSTRUMENTAL_GAP_MS = 8000;

/**
 * Erkennt Abschnitte aus dem Text: Zeilen werden an Pausen zu Blöcken gruppiert;
 * Blöcke, deren Zeilen im Song mehrfach vorkommen, sind Refrains. Lange Pausen
 * werden „instrumental“, davor Intro, danach Outro.
 */
export function detectSections(lines: LyricLine[], durationMs: number): Section[] {
  if (!lines.length) return [];

  const counts = new Map<string, number>();
  for (const l of lines) {
    const k = normalizeLine(l.text);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  // Blöcke bilden
  const blocks: LyricLine[][] = [];
  for (const l of lines) {
    const cur = blocks.at(-1);
    const prev = cur?.at(-1);
    if (!cur || !prev || l.startMs - prev.endMs > BLOCK_GAP_MS) blocks.push([l]);
    else cur.push(l);
  }

  const isChorus = (b: LyricLine[]) => {
    const repeated = b.filter((l) => (counts.get(normalizeLine(l.text)) ?? 0) >= 2).length;
    return b.length >= 2 && repeated / b.length >= 0.5;
  };

  const sections: Section[] = [];
  const first = lines[0]!;
  if (first.startMs > 3000) sections.push({ kind: "intro", startMs: 0, endMs: first.startMs });

  let choruses = 0;
  blocks.forEach((b, i) => {
    const start = b[0]!.startMs;
    const end = b.at(-1)!.endMs;
    const chorus = isChorus(b);
    // Kurzer, nicht wiederholter Block nach mindestens zwei Refrains und vor einem weiteren → Bridge
    const later = blocks.slice(i + 1).some(isChorus);
    const kind: Section["kind"] = chorus ? "chorus" : choruses >= 2 && later && b.length <= 3 ? "bridge" : "verse";
    if (chorus) choruses++;

    // Abschnitt reicht bis zum nächsten Block (Pausen gehören dazu), außer bei langen Instrumentalteilen
    const nextStart = blocks[i + 1]?.[0]?.startMs;
    const gap = nextStart !== undefined ? nextStart - end : 0;
    const sectionEnd = nextStart !== undefined && gap < INSTRUMENTAL_GAP_MS ? nextStart : end;
    const prevSec = sections.at(-1);
    if (prevSec && prevSec.kind === kind && kind !== "chorus" && prevSec.endMs === start) prevSec.endMs = sectionEnd;
    else sections.push({ kind, startMs: start, endMs: sectionEnd });

    if (nextStart !== undefined && gap >= INSTRUMENTAL_GAP_MS) sections.push({ kind: "instrumental", startMs: end, endMs: nextStart });
  });

  const lastEnd = lines.at(-1)!.endMs;
  if (durationMs - lastEnd > 3000) sections.push({ kind: "outro", startMs: lastEnd, endMs: durationMs });
  return sections;
}
