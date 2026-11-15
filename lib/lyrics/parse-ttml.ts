import type { LyricLine, LyricWord, Section, SectionKind } from "@/lib/song-context/schema";

/** Zeitangabe aus TTML: „27.395“, „1:00.964“, „1:02:03.5“, optional mit „s“ → Millisekunden. */
export function ttmlTime(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const parts = v.trim().replace(/s$/, "").split(":").map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return undefined;
  return Math.round(parts.reduce((acc, n) => acc * 60 + n, 0) * 1000);
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** Apple-Music-Abschnittsnamen (itunes:songPart) → eigene Abschnittsarten. */
const PART: Record<string, SectionKind> = {
  intro: "intro",
  verse: "verse",
  prechorus: "prechorus",
  chorus: "chorus",
  postchorus: "chorus",
  hook: "chorus",
  refrain: "chorus",
  bridge: "bridge",
  interlude: "instrumental",
  instrumental: "instrumental",
  outro: "outro",
};

export type TtmlDoc = {
  timing: "word" | "line";
  lines: LyricLine[];
  /** Abschnitte aus itunes:songPart, Lücken als Intro/Instrumental/Outro ergänzt; leer, wenn keine Angaben */
  sections: Section[];
  durationMs?: number;
  /** einzelne Sänger (person/character) mit Name, in Reihenfolge des ersten Auftretens */
  agents: Array<{ id: string; name?: string }>;
};

/**
 * Liest Apple-Music-TTML (wie von Better Lyrics geliefert).
 * - Wörter: <span begin end>; getrennte Silben ohne Leerzeichen dazwischen werden zu einem Wort,
 *   ihr Timing bleibt als `syllables` erhalten (Wort- und Silben-Timing, itunes:timing="Word"/"Syllable").
 * - Hintergrundgesang (ttm:role="x-bg") wird ausgelassen – die Karaoke-Füllung folgt der Hauptstimme.
 */
export function parseTtml(ttml: string, songDurationMs?: number): TtmlDoc {
  const timing = /itunes:timing="Line"/i.test(ttml) ? "line" : "word";
  const durationMs = ttmlTime(/<body[^>]*\sdur="([^"]+)"/.exec(ttml)?.[1]) ?? songDurationMs;

  const personAgents = new Map<string, string | undefined>();
  // Einzelne Sänger: type „person“ oder „character“. „group“ (z. B. v1000, alle zusammen), „organization“ und
  // „other“ (z. B. v2000) bekommen keine Zuordnung. Agenten auch selbstschließend: <ttm:agent … />
  for (const m of ttml.matchAll(/<ttm:agent\b([^>]*?)(?:\/>|>([\s\S]*?)<\/ttm:agent>)/g)) {
    const id = attr(m[1]!, "xml:id");
    const type = attr(m[1]!, "type") ?? "person";
    if (id && (type === "person" || type === "character"))
      personAgents.set(id, /<ttm:name[^>]*>([^<]*)</.exec(m[2] ?? "")?.[1]?.trim() || undefined);
  }

  const lines: LyricLine[] = [];
  const sections: Section[] = [];
  const seenAgents: string[] = [];
  const divRe = /<div\b([^>]*)>([\s\S]*?)<\/div>/g;
  const blocks = [...ttml.matchAll(divRe)];
  const containers = blocks.length ? blocks.map((b) => ({ tag: b[1]!, body: b[2]! })) : [{ tag: "", body: ttml }];

  for (const c of containers) {
    const before = lines.length;
    for (const p of c.body.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
      const start = ttmlTime(attr(p[1]!, "begin"));
      const end = ttmlTime(attr(p[1]!, "end"));
      if (start === undefined || end === undefined) continue;
      const agent = attr(p[1]!, "ttm:agent");
      // Hintergrundgesang entfernen (verschachtelte Spans)
      const inner = p[2]!.replace(/<span[^>]*ttm:role="x-bg"[^>]*>(?:\s*<span\b[^>]*>[^<]*<\/span>\s*)*<\/span>/g, "");
      const words: LyricWord[] = [];
      let glue = false; // nächste Silbe an das vorige Wort anhängen?
      const tokens = inner.matchAll(/<span\b([^>]*)>([^<]*)<\/span>|(\s+)|<[^>]+>|([^<\s]+)/g);
      for (const t of tokens) {
        if (t[3]) {
          glue = false;
          continue;
        }
        if (t[1] !== undefined) {
          const text = decode(t[2]!);
          const ws = ttmlTime(attr(t[1], "begin"));
          const we = ttmlTime(attr(t[1], "end"));
          if (ws === undefined || we === undefined || !text.trim()) continue;
          const prev = words.at(-1);
          if (glue && prev) {
            // Silbe desselben Worts: Text anhängen, Silben mit eigenem Timing behalten
            prev.syllables ??= [{ startMs: prev.startMs, endMs: prev.endMs, text: prev.text }];
            prev.syllables.push({ startMs: ws, endMs: we, text: text.trim() });
            prev.text += text.trim();
            prev.endMs = we;
          } else words.push({ startMs: ws, endMs: we, text: text.trim() });
          glue = !/\s$/.test(text);
        }
      }
      const text =
        words.length > 0
          ? words.map((w) => w.text).join(" ")
          : decode(inner.replace(/<[^>]+>/g, ""))
              .replace(/\s+/g, " ")
              .trim();
      if (!text) continue;
      if (agent && personAgents.has(agent) && !seenAgents.includes(agent)) seenAgents.push(agent);
      lines.push({ startMs: start, endMs: end, text, ...(agent ? { agent } : {}), ...(words.length ? { words } : {}) });
    }
    const kind = PART[(attr(c.tag, "itunes:songPart") ?? "").toLowerCase()];
    const ds = ttmlTime(attr(c.tag, "begin")) ?? lines[before]?.startMs;
    const de = ttmlTime(attr(c.tag, "end")) ?? lines.at(-1)?.endMs;
    if (kind && ds !== undefined && de !== undefined && lines.length > before) sections.push({ kind, startMs: ds, endMs: de });
  }

  return {
    timing,
    lines,
    sections: sections.length ? fillGaps(sections, durationMs) : [],
    ...(durationMs !== undefined ? { durationMs } : {}),
    agents: seenAgents.map((id) => ({ id, ...(personAgents.get(id) ? { name: personAgents.get(id) } : {}) })),
  };
}

/** Lücken zwischen den Abschnitten: Anfang → Intro, Mitte (> 4 s) → Instrumental, Ende → Outro. */
function fillGaps(sections: Section[], durationMs?: number): Section[] {
  const out: Section[] = [];
  const sorted = [...sections].sort((a, b) => a.startMs - b.startMs);
  if (sorted[0]!.startMs > 3000) out.push({ kind: "intro", startMs: 0, endMs: sorted[0]!.startMs });
  sorted.forEach((s, i) => {
    out.push(s);
    const next = sorted[i + 1];
    if (next && next.startMs - s.endMs > 4000) out.push({ kind: "instrumental", startMs: s.endMs, endMs: next.startMs });
    else if (next && next.startMs > s.endMs) s.endMs = next.startMs; // kleine Lücke schließen
  });
  const last = sorted.at(-1)!;
  if (durationMs && durationMs - last.endMs > 3000) {
    if (last.kind === "outro")
      last.endMs = durationMs; // vorhandenes Outro bis zum Songende verlängern
    else out.push({ kind: "outro", startMs: last.endMs, endMs: durationMs });
  }
  return out;
}
