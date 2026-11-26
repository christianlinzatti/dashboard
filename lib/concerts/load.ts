import type { Concert, SongStatic, Setlist } from "@/lib/song-context/schema";
import { BRIDGE_SHOPS, type BridgeList } from "./shared/protocol";

const SEP = "\u001f";

export function concertsUrl(song: SongStatic, viaBridge = false) {
  return `/api/concerts?${new URLSearchParams({
    ids: song.artists.map((a) => a.spotifyId).join(SEP),
    names: song.artists.map((a) => a.name).join(SEP),
    // oeticket/eventim.de fragt dann die Pi-Bridge – der Server wird dort gesperrt
    ...(viaBridge ? { ohne: BRIDGE_SHOPS.join(",") } : {}),
  })}`;
}

export type ConcertAnswer = {
  concerts: Concert[];
  setlists: Record<string, Setlist>;
  area?: { name: string; radiusKm: number };
  sources?: Array<{ artist: string; provider: string; state: string; error?: string; cached?: boolean }>;
};

/**
 * Konzerte zu einem Song laden. Mit Pi-Bridge in zwei Schritten: erst die übrigen Quellen vom Server zeigen, dann
 * oeticket/eventim.de von der Bridge (Heimanschluss – den Server sperrt Eventim) holen und zusammen mit dem Server
 * zusammenführen. Antwortet die Bridge nicht (alte Version, abgeschaltet), versucht es der Server wie bisher selbst.
 */
export async function loadConcerts(
  song: SongStatic,
  deps: {
    viaBridge: boolean;
    signal: AbortSignal;
    fetch: typeof fetch;
    askBridge: (names: string[], signal: AbortSignal) => Promise<BridgeList[] | null>;
    show: (a: ConcertAnswer) => void;
    warn: (msg: string) => void;
  },
): Promise<void> {
  const { signal } = deps;
  const get = async (url: string) => {
    const res = await deps.fetch(url, { signal });
    return res.ok ? ((await res.json()) as ConcertAnswer) : null;
  };
  const first = await get(concertsUrl(song, deps.viaBridge));
  if (first) deps.show(first);
  if (!deps.viaBridge || signal.aborted) return;
  const names = song.artists.map((a) => a.name);
  const bridge = await deps.askBridge(names, signal);
  // Song gewechselt, oder die Bridge ist gerade ausgelastet (schneller Songwechsel): beim nächsten Song wieder
  if (signal.aborted || bridge?.length === 0) return;
  if (!bridge) {
    deps.warn("Pi-Bridge: keine Konzertantwort – oeticket/eventim.de über den Server");
    const plain = await get(concertsUrl(song));
    if (plain) deps.show(plain);
    return;
  }
  const res = await deps.fetch("/api/concerts", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: song.artists.map((a) => a.spotifyId), names, bridge }),
  });
  if (res.ok) deps.show((await res.json()) as ConcertAnswer);
}
