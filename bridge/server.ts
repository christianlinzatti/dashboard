import http from "node:http";
import { WebSocketServer } from "ws";
import { z } from "zod";
import type { LampController } from "./controller.ts";

/** Nachricht vom Dashboard: aktuelles Lichtsignal (ca. 20×/s, nur bei Änderung). */
export const lightMessage = z.object({
  type: z.literal("light"),
  lamps: z.boolean(),
  signal: z.object({
    base: z.string().regex(/^#[0-9a-f]{6}$/i),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    brightness: z.number().min(0).max(2),
    pulse: z.number().min(0).max(1),
  }),
});

export type BridgeOptions = {
  host?: string;
  port?: number;
  /** Erlaubte Herkunft der Webseite (z. B. https://dein-projekt.vercel.app) – schützt vor fremden Seiten */
  allowedOrigins: string[];
  controller: LampController;
};

/**
 * WebSocket-Server der Pi-Bridge: nur auf 127.0.0.1, nur für erlaubte Dashboard-Herkünfte.
 * GET /status liefert Lampen und Zustand (für Diagnose und das Dashboard).
 */
export function createBridgeServer(opts: BridgeOptions) {
  const { host = "127.0.0.1", port = 8787, allowedOrigins, controller } = opts;
  const allowed = (origin: string | undefined) => !!origin && allowedOrigins.includes(origin);
  let clients = 0;

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    if (allowed(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin!);
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "GET" && req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, clients, ...controller.status() }));
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
      if (m.success) controller.apply(m.data.signal, m.data.lamps);
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
