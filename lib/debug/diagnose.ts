/**
 * Kurzdiagnose aus dem Song-Kontext (Debug-Panel und /debug): die häufigsten Fragen auf einen Blick –
 * Warum keine Lyrics? Warum kein Mikrofon? Läuft überhaupt ein Song? Arbeitet auf dem gesendeten JSON, daher
 * bewusst tolerant gegenüber fehlenden Feldern.
 */
export type Finding = { label: string; value: string; level: "ok" | "warnung" | "fehler" | "info" };

type Ctx = {
  song?: {
    track?: { title?: string };
    artists?: Array<{ name?: string }>;
    lyrics?: { lines?: unknown };
    status?: {
      lyrics?: { state?: string; provider?: string; detail?: string };
      show?: { state?: string; provider?: string; detail?: string };
    };
    show?: { motto?: string };
    memory?: { drops?: Array<{ ms?: number; seen?: number }>; bpm?: number; plays?: number };
  } | null;
  playback?: { isPlaying?: boolean };
  live?: { micState?: string };
  env?: { secureContext?: boolean; micApi?: boolean; origin?: string };
  offset?: { manual?: number; device?: number; song?: number; measured?: { n?: number; spreadMs?: number } | null };
};

const sec = (ms: number) => `${ms >= 0 ? "+" : "−"}${(Math.abs(ms) / 1000).toFixed(1).replace(".", ",")} s`;

const MIC: Record<string, Omit<Finding, "label">> = {
  aus: { value: "aus – in der Steuerleiste (Bildschirm antippen) „Mikro an“ tippen; erst dann fragt der Browser", level: "info" },
  startet: { value: "startet … (Berechtigungsabfrage offen?)", level: "warnung" },
  aktiv: { value: "aktiv", level: "ok" },
  verweigert: {
    value: "verweigert – im Browser die Mikrofon-Berechtigung für diese Seite erlauben (Schloss-Symbol in der Adresszeile)",
    level: "fehler",
  },
  "nicht-verfuegbar": {
    value: "nicht verfügbar – kein Mikrofon gefunden oder unsichere Verbindung (nur https oder localhost erlaubt)",
    level: "fehler",
  },
  fehler: { value: "Fehler beim Start (Mikrofon belegt?)", level: "fehler" },
};

const LYRICS_LEVEL: Record<string, Finding["level"]> = {
  ok: "ok",
  loading: "info",
  idle: "info",
  missing: "warnung",
  error: "fehler",
};

export function diagnose(ctx: Ctx): Finding[] {
  const out: Finding[] = [];
  const song = ctx.song;
  if (!song) return [{ label: "Song", value: "kein Song – Spotify spielt nichts oder ist nicht angemeldet", level: "warnung" }];
  out.push({
    label: "Song",
    value: `${song.track?.title ?? "?"} – ${(song.artists ?? []).map((a) => a.name).join(", ")} · ${ctx.playback?.isPlaying ? "spielt" : "pausiert"}`,
    level: "info",
  });
  const l = song.status?.lyrics;
  const lines = Array.isArray(song.lyrics?.lines)
    ? song.lyrics.lines.length
    : typeof song.lyrics?.lines === "string"
      ? song.lyrics.lines
      : null;
  out.push({
    label: "Lyrics",
    value: [
      l?.state ?? "unbekannt",
      l?.provider && `von ${l.provider}`,
      lines !== null && `${typeof lines === "number" ? `${lines} Zeilen` : lines}`,
      l?.detail,
    ]
      .filter(Boolean)
      .join(" · "),
    level: LYRICS_LEVEL[l?.state ?? ""] ?? "warnung",
  });
  out.push(showFinding(song.status?.show, !!song.show));
  const mem = song.memory;
  out.push({
    label: "Song-Gedächtnis",
    value: mem
      ? `${mem.plays ?? 0}× mit Mikrofon gehört · ${mem.drops?.length ?? 0} Drops bekannt${mem.bpm ? ` · ${mem.bpm} BPM gemessen` : ""}`
      : "noch nichts gemessen – mit eingeschaltetem Mikrofon merkt sich das Dashboard Drops und Tempo",
    level: mem?.drops?.length ? "ok" : "info",
  });
  if (ctx.offset) {
    const o = ctx.offset;
    const parts = [
      `von Hand ${sec(o.manual ?? 0)}`,
      `Lautsprecher ${sec(o.device ?? 0)}`,
      ...(o.song ? [`dieser Song ${sec(o.song)}`] : []),
    ];
    out.push({
      label: "Lyrics-Versatz",
      value: `${parts.join(" · ")}${o.measured ? ` · gemessen an ${o.measured.n} Einsätzen (±${o.measured.spreadMs} ms)` : " · noch nicht gemessen (Mikrofon an, Gesang)"}`,
      level: o.measured ? "ok" : "info",
    });
  }
  const mic = MIC[ctx.live?.micState ?? "aus"] ?? { value: ctx.live?.micState ?? "?", level: "info" as const };
  out.push({ label: "Mikrofon", ...mic });
  if (ctx.env) {
    if (ctx.env.secureContext === false)
      out.push({
        label: "Verbindung",
        value: `unsicher (${ctx.env.origin ?? "http"}) – Mikrofon nur über https oder http://localhost`,
        level: "fehler",
      });
    else if (ctx.env.micApi === false)
      out.push({ label: "Verbindung", value: "Browser bietet kein Mikrofon an (getUserMedia fehlt)", level: "fehler" });
  }
  return out;
}

/** KI-Regie: wurde die KI gefragt (Modellname) oder lief die Show nach festen Regeln? */
function showFinding(s: { state?: string; provider?: string; detail?: string } | undefined, hasBrief: boolean): Finding {
  const label = "KI-Regie";
  const extra = s?.detail ? ` · ${s.detail}` : "";
  switch (s?.state) {
    case "ok":
      return s.provider && s.provider !== "regeln"
        ? { label, value: `ja – ${s.provider}${hasBrief ? " (Bühne, Abschnitte, Motto)" : ""}${extra}`, level: "ok" }
        : { label, value: `nein – feste Regeln${extra}`, level: "info" };
    case "missing":
      return {
        label,
        value: s.detail ? `nein – ${s.detail}, Show nach festen Regeln` : "nein – keine KI eingerichtet, Show nach festen Regeln",
        level: s.detail ? "warnung" : "info",
      };
    case "loading":
      return { label, value: "wird gefragt …", level: "info" };
    case "error":
      return { label, value: `Fehler${extra}`, level: "fehler" };
    default:
      return { label, value: "noch nicht gefragt", level: "info" };
  }
}

/** Umgebung des Browsers, in dem das Dashboard läuft (fürs Debug-Panel und den Versand an /debug) */
export function browserEnv() {
  if (typeof window === "undefined") return undefined;
  return {
    secureContext: window.isSecureContext,
    micApi: !!navigator.mediaDevices?.getUserMedia,
    origin: location.origin,
    userAgent: navigator.userAgent,
  };
}
