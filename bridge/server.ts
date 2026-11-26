import http from "node:http";
import { WebSocketServer } from "ws";
import { z } from "zod";
import type { LampController } from "./controller.ts";
import type { Watchdog } from "./watchdog.ts";
import type { Display } from "./display.ts";
import type { ConcertFetcher } from "./concerts.ts";
import { concertsRequest, type ConcertsResponse } from "../lib/concerts/shared/protocol.ts";

/** Nachricht vom Dashboard: aktuelles Lichtsignal (ca. 20×/s, nur bei Änderung). */
export const lightMessage = z.object({
  type: z.literal("light"),
  lamps: z.boolean(),
  signal: z.object({
    base: z.string().regex(/^#[0-9a-f]{6}$/i),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    brightness: z.number().min(0).max(2),
    pulse: z.number().min(0).max(1),
    /** Lauflicht: Position 0..1 über alle Lampen (fehlt = aus) */
    chase: z.number().min(0).max(1).optional(),
  }),
});

/** Lebenszeichen vom Dashboard (alle 10 s) für den Watchdog. */
export const heartbeatMessage = z.object({
  type: z.literal("heartbeat"),
  /** ms seit dem letzten gezeichneten Bild (hängt die Grafik?) */
  frameAgeMs: z.number().min(0).max(86_400_000),
  visible: z.boolean(),
});

/** Bildschirm ein/aus (Ruhezeit des Dashboards) – nur wirksam, wenn in der Konfiguration Befehle stehen */
export const displayMessage = z.object({ type: z.literal("display"), on: z.boolean() });

export type BridgeOptions = {
  host?: string;
  port?: number;
  /** Erlaubte Herkunft der Webseite (z. B. https://dein-projekt.vercel.app) – schützt vor fremden Seiten */
  allowedOrigins: string[];
  controller: LampController;
  /** optional: Watchdog, der bei ausbleibendem Lebenszeichen eingreift */
  watchdog?: Watchdog;
  /** optional: Bildschirm per Systembefehl ein-/ausschalten */
  display?: Display;
  /** optional: Konzerttermine (oeticket, eventim.de) vom Heimanschluss aus abfragen */
  concerts?: ConcertFetcher;
};

/** so viele Konzert-Abfragen gleichzeitig (über alle Verbindungen); weitere bekommen eine Absage */
const MAX_CONCERT_REQUESTS = 3;

/**
 * WebSocket-Server der Pi-Bridge: nur auf 127.0.0.1, nur für erlaubte Dashboard-Herkünfte.
 * GET /status liefert Lampen und Zustand (für Diagnose und das Dashboard).
 */
export function createBridgeServer(opts: BridgeOptions) {
  const { host = "127.0.0.1", port = 8787, allowedOrigins, controller, watchdog, display, concerts } = opts;
  const allowed = (origin: string | undefined) => !!origin && allowedOrigins.includes(origin);
  let clients = 0;
  let concertRequests = 0;

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    if (allowed(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin!);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "GET" && req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: true,
          clients,
          ...controller.status(),
          ...(watchdog ? { watchdog: watchdog.status() } : {}),
          ...(display ? { display: display.status() } : {}),
          ...(concerts ? { concerts: concerts.status() } : {}),
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({
    server,
    maxPayload: 4096,
    verifyClient: ({ origin }: { origin?: string }) => allowed(origin),
  });

  wss.on("connection", (ws) => {
    clients++;
    ws.on("close", () => clients--);
    ws.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        return;
      }
      const m = lightMessage.safeParse(parsed);
      if (m.success) return controller.apply(m.data.signal, m.data.lamps);
      const h = heartbeatMessage.safeParse(parsed);
      if (h.success) {
        watchdog?.beat(h.data.frameAgeMs, h.data.visible);
        display?.alive();
        return;
      }
      const d = displayMessage.safeParse(parsed);
      if (d.success) return display?.set(d.data.on);
      const c = concertsRequest.safeParse(parsed);
      if (c.success) {
        const reply = (results: ConcertsResponse["results"], off?: true) => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "concerts", id: c.data.id, results, off }));
        };
        if (!concerts) return reply([], true);
        if (concertRequests >= MAX_CONCERT_REQUESTS) return reply([]);
        concertRequests++;
        void concerts
          .lookup(c.data.artists, c.data.fresh)
          .then(reply, () => reply([]))
          .finally(() => concertRequests--);
      }
    });
  });

  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({
        port: typeof addr === "object" && addr ? addr.port : port,
        close: () =>
          new Promise<void>((r) => {
            wss.clients.forEach((c) => c.terminate());
            wss.close();
            server.close(() => r());
          }),
      });
    });
  });
}
