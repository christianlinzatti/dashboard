import { concertsResponse, type BridgeList } from "@/lib/concerts/shared/protocol";

type Sock = {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
};

/**
 * Konzerttermine von oeticket und eventim.de über die Pi-Bridge (fragt vom Heimanschluss aus, der Server wird dort
 * gesperrt). Eigene, kurze Verbindung je Anfrage; ohne Bridge, bei alter Bridge (kennt die Nachricht nicht) oder nach
 * `timeoutMs` → null (ebenso, wenn sie in der Bridge abgeschaltet ist), ist die Bridge ausgelastet → []. Die Bridge stellt die Anfragen mit Pausen nacheinander, beim
 * ersten Mal dauert es deshalb.
 */
export function askBridgeConcerts(
  url: string,
  artists: string[],
  opts: { fresh?: boolean; timeoutMs?: number; signal?: AbortSignal; createSocket?: (url: string) => Sock } = {},
): Promise<BridgeList[] | null> {
  const create = opts.createSocket ?? ((u: string) => new WebSocket(u) as unknown as Sock);
  const id = Math.random().toString(36).slice(2, 12);
  return new Promise((resolve) => {
    let done = false;
    let ws: Sock | null = null;
    const finish = (v: BridgeList[] | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        ws?.close();
      } catch {
        /* schon zu */
      }
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), opts.timeoutMs ?? 150_000);
    if (opts.signal?.aborted) return finish(null);
    opts.signal?.addEventListener("abort", () => finish(null), { once: true });
    try {
      ws = create(url);
    } catch {
      return finish(null);
    }
    ws.onopen = () =>
      ws?.send(JSON.stringify({ type: "concerts", id, artists: artists.slice(0, 5), ...(opts.fresh ? { fresh: true } : {}) }));
    ws.onerror = () => finish(null);
    ws.onclose = () => finish(null);
    ws.onmessage = (e) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(e.data));
      } catch {
        return;
      }
      const r = concertsResponse.safeParse(parsed);
      if (r.success && r.data.id === id) finish(r.data.off ? null : r.data.results);
    };
  });
}
