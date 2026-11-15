import type { LightFrame } from "@/lib/stage/lights";

export type BridgeState = "aus" | "verbindet" | "verbunden" | "getrennt";

type WsLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
};

export type BridgeClientOptions = {
  url: string;
  /** für Tests ersetzbar */
  createSocket?: (url: string) => WsLike;
  minIntervalMs?: number;
  onState?: (s: BridgeState) => void;
};

const OPEN = 1;
const BACKOFF_MS = [2000, 5000, 10_000, 30_000, 60_000];

/** Nachricht an die Pi-Bridge (Format: bridge/server.ts → lightMessage). */
export function lightMessage(f: Pick<LightFrame, "signal">, lamps: boolean) {
  const r = (v: number) => Math.round(v * 100) / 100;
  return JSON.stringify({
    type: "light",
    lamps,
    signal: { base: f.signal.base, accent: f.signal.accent, brightness: r(f.signal.brightness), pulse: r(f.signal.pulse) },
  });
}

/**
 * Verbindung zur Pi-Bridge: sendet das Lichtsignal höchstens alle `minIntervalMs` und nur bei Änderung,
 * verbindet sich nach Abbrüchen mit wachsendem Abstand neu. Ohne Bridge (z. B. am Laptop) passiert nichts.
 */
export function createBridgeClient(opts: BridgeClientOptions) {
  const create = opts.createSocket ?? ((url: string) => new WebSocket(url) as unknown as WsLike);
  const minInterval = opts.minIntervalMs ?? 50;
  let ws: WsLike | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let lastSent = "";
  let lastSentAt = 0;
  let pending: string | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const setState = (s: BridgeState) => opts.onState?.(s);

  const connect = () => {
    if (stopped) return;
    setState("verbindet");
    const sock = create(opts.url);
    ws = sock;
    sock.onopen = () => {
      attempt = 0;
      lastSent = "";
      setState("verbunden");
    };
    sock.onerror = () => sock.close();
    sock.onclose = () => {
      if (ws === sock) ws = null;
      if (stopped) return;
      setState("getrennt");
      timer = setTimeout(connect, BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]);
    };
  };

  const flush = () => {
    flushTimer = undefined;
    if (!pending || !ws || ws.readyState !== OPEN) return;
    if (pending !== lastSent) {
      ws.send(pending);
      lastSent = pending;
      lastSentAt = Date.now();
    }
    pending = null;
  };

  return {
    start() {
      stopped = false;
      connect();
    },
    /** Lebenszeichen für den Watchdog der Bridge (nur bei offener Verbindung). */
    heartbeat(frameAgeMs: number, visible: boolean) {
      if (ws && ws.readyState === OPEN)
        ws.send(JSON.stringify({ type: "heartbeat", frameAgeMs: Math.round(frameAgeMs), visible }));
    },
    /** Neues Lichtsignal (pro Frame aufrufbar – wird gedrosselt). */
    update(f: Pick<LightFrame, "signal">, lamps: boolean, now = Date.now()) {
      pending = lightMessage(f, lamps);
      const wait = minInterval - (now - lastSentAt);
      if (wait <= 0) flush();
      else flushTimer ??= setTimeout(flush, wait);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(flushTimer);
      ws?.close();
      ws = null;
      setState("aus");
    },
  };
}
