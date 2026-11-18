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
    status?: { lyrics?: { state?: string; provider?: string; detail?: string } };
  } | null;
  playback?: { isPlaying?: boolean };
  live?: { micState?: string };
  env?: { secureContext?: boolean; micApi?: boolean; origin?: string };
};

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
