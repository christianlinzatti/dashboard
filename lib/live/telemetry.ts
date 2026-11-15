import type { LogEntry } from "./log-schema";

/**
 * Meldungen vom Kiosk an den Server (`/api/log`): Fehler, abgefangene Komponentenfehler, Leistungsproben.
 * Gleiche Meldungen innerhalb einer Minute werden gezählt statt mehrfach gesendet; Versand gebündelt.
 */
export function createTelemetry(opts: {
  send: (entries: LogEntry[]) => Promise<unknown>;
  now?: () => number;
  dedupeMs?: number;
}) {
  const now = opts.now ?? Date.now;
  const dedupeMs = opts.dedupeMs ?? 60_000;
  const queue: LogEntry[] = [];
  const recent = new Map<string, { entry: LogEntry; at: number }>();

  function report(level: LogEntry["level"], source: string, message: string) {
    const msg = message.replace(/\s+/g, " ").trim().slice(0, 500) || "(ohne Text)";
    const key = `${level}|${source}|${msg}`;
    const seen = recent.get(key);
    if (seen && now() - seen.at < dedupeMs) {
      seen.entry.count++;
      if (!queue.includes(seen.entry)) queue.push(seen.entry);
      return;
    }
    const entry: LogEntry = { level, source: source.slice(0, 40), message: msg, count: 1, at: now() };
    recent.set(key, { entry, at: now() });
    queue.push(entry);
    if (recent.size > 200) recent.delete(recent.keys().next().value!);
  }

  async function flush() {
    if (!queue.length) return;
    const batch = queue.splice(0, 20).map((e) => ({ ...e }));
    await opts.send(batch).catch(() => undefined); // Protokoll darf nie selbst Fehler werfen
  }

  return { report, flush, pending: () => queue.length };
}

let shared: ReturnType<typeof createTelemetry> | undefined;

/** Im Browser: globale Fehler abfangen und alle 15 s gebündelt senden. Gibt eine Aufräumfunktion zurück. */
export function installTelemetry(): () => void {
  shared ??= createTelemetry({
    send: (entries) =>
      fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
        keepalive: true,
      }),
  });
  const t = shared;
  const onError = (e: ErrorEvent) =>
    t.report(
      "fehler",
      "js",
      `${e.message.replace(/^Uncaught\s+/, "")}${e.filename ? ` (${e.filename.split("/").pop()}:${e.lineno})` : ""}`,
    );
  const onRejection = (e: PromiseRejectionEvent) =>
    t.report("fehler", "js", `Unbehandelt: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`);
  const onHide = () => void t.flush();
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("pagehide", onHide);
  const timer = setInterval(() => void t.flush(), 15_000);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("pagehide", onHide);
    clearInterval(timer);
  };
}

/** Meldung aus der App (z. B. Fehlergrenze der 3D-Szene, Leistungsprobe). Ohne installierte Telemetrie: nichts. */
export function report(level: LogEntry["level"], source: string, message: string) {
  shared?.report(level, source, message);
}
