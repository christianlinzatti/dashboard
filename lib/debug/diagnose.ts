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
      concerts?: { state?: string; detail?: string };
      info?: { state?: string; detail?: string };
    };
    info?: { photos?: Array<{ source?: string }> };
    concerts?: Array<{ distanceKm?: number }>;
    concertArea?: { name?: string; radiusKm?: number };
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
  out.push(infoFinding(song));
  out.push(concertFinding(song));
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

/** Konzerttermine: wie viele, wie viele im Umkreis, fehlende Quellen (Details unter „Konzerttermine“) */
function concertFinding(song: NonNullable<Ctx["song"]>): Finding {
  const st = song.status?.concerts;
  if (!st && !song.concerts) return { label: "Konzerte", value: "noch nicht geladen", level: "info" };
  const list = song.concerts ?? [];
  const radius = song.concertArea?.radiusKm ?? 200;
  const near = list.filter((c) => c.distanceKm !== undefined && c.distanceKm <= radius).length;
  const parts = [
    `${list.length} Termin${list.length === 1 ? "" : "e"}`,
    `${near} im Umkreis von ${radius} km${song.concertArea?.name ? ` um ${song.concertArea.name}` : ""}`,
    st?.detail,
  ];
  return { label: "Konzerte", value: parts.filter(Boolean).join(" · "), level: st?.detail ? "warnung" : "ok" };
}

const SOURCE_NAME: Record<string, string> = { commons: "Wikipedia", theaudiodb: "TheAudioDB", flickr: "Flickr", demo: "Demo" };

/** Infos und Fotos: wie viele Fotos aus welcher Quelle, welche Quelle ausgefallen ist (mit Abhilfe) */
function infoFinding(song: NonNullable<Ctx["song"]>): Finding {
  const st = song.status?.info;
  if (!st || st.state === "idle" || st.state === "loading")
    return { label: "Infos & Fotos", value: st?.state === "loading" ? "lädt …" : "noch nicht geladen", level: "info" };
  const photos = song.info?.photos ?? [];
  const bySource = new Map<string, number>();
  for (const p of photos)
    bySource.set(SOURCE_NAME[p.source ?? ""] ?? "andere", (bySource.get(SOURCE_NAME[p.source ?? ""] ?? "andere") ?? 0) + 1);
  const counts = [...bySource].map(([k, n]) => `${k} ${n}`).join(", ");
  const throttled = /\b429\b|ausgelastet/.test(st.detail ?? "");
  const parts = [
    st.state === "missing"
      ? "nichts gefunden"
      : `${photos.length} Foto${photos.length === 1 ? "" : "s"}${counts ? ` (${counts})` : ""}`,
    st.detail,
    throttled ? "Tipp: INFO_CONTACT (E-Mail) setzen – Wikimedia/MusicBrainz drosseln anonyme Server seltener" : null,
  ];
  return {
    label: "Infos & Fotos",
    value: parts.filter(Boolean).join(" · "),
    level: st.detail ? "warnung" : st.state === "missing" ? "info" : "ok",
  };
}
