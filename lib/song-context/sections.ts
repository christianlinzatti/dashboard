import type { Section } from "./schema";

/** Abschnitte lückenlos und überlappungsfrei machen (Lücken gehören zum vorherigen Abschnitt). */
export function contiguous(sections: Section[], durationMs: number): Section[] {
  const out: Section[] = [];
  for (const s of [...sections].sort((a, b) => a.startMs - b.startMs)) {
    const prev = out.at(-1);
    const start = Math.max(s.startMs, prev?.endMs ?? 0);
    if (!prev && start > 0) out.push({ kind: "intro", startMs: 0, endMs: start });
    else if (prev && prev.endMs < start) prev.endMs = start;
    const end = Math.min(s.endMs, durationMs);
    if (end > start) out.push({ kind: s.kind, startMs: start, endMs: end });
  }
  if (!out.length) return [{ kind: "verse", startMs: 0, endMs: durationMs }];
  out.at(-1)!.endMs = durationMs;
  return out;
}
