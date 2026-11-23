import { AuthCircuitError, createWebToken, retryAfterMs, UA, type WebTokenConfig } from "./web-token";
import type { ProviderStatus } from "@/lib/lyrics/types";

/**
 * Spotify Canvas (inoffiziell): die kurzen Loop-Videos/Bilder, die Künstler zu einem Track hinterlegen und die der
 * Web-Player hinter dem Cover zeigt. Abgerufen über denselben Web-Player-Token wie die Color-Lyrics
 * (sp_dc + TOTP, lib/spotify/web-token.ts) am internen Endpunkt `canvaz-cache` – als Protobuf.
 *
 * Verstößt gegen Spotifys Nutzungsbedingungen und kann jederzeit brechen. Lehnt Spotify ab, liefert die Funktion
 * `null` (kein Fehler); der Circuit-Breaker pausiert wie bei den Lyrics. Keine automatische Secret-Beschaffung.
 */

// ---------------------------------------------------------------- Protobuf (nur die gebrauchten Felder, von Hand)

/** Varint anhängen */
function putVarint(out: number[], value: number) {
  let v = value >>> 0;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

/** Längen-begrenztes Feld (wire type 2) anhängen */
function putField(out: number[], field: number, bytes: number[]) {
  putVarint(out, (field << 3) | 2);
  putVarint(out, bytes.length);
  out.push(...bytes);
}

/**
 * Anfrage: EntityCanvazRequest { repeated Entity entities = 1 { string entity_uri = 1 } }.
 * `uris` z. B. ["spotify:track:<id>"].
 */
export function encodeCanvasRequest(uris: readonly string[]): Uint8Array {
  const out: number[] = [];
  for (const uri of uris) {
    const entity: number[] = [];
    putField(entity, 1, [...Buffer.from(uri, "utf8")]);
    putField(out, 1, entity);
  }
  return Uint8Array.from(out);
}

/** Minimaler Protobuf-Leser (nur die gebrauchten Wire-Types) */
class Reader {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}
  get done() {
    return this.pos >= this.buf.length;
  }
  varint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = this.buf[this.pos++]!;
      result += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) break;
      shift += 7;
    }
    return result;
  }
  bytes(): Uint8Array {
    const len = this.varint();
    const slice = this.buf.subarray(this.pos, this.pos + len);
    this.pos += len;
    return slice;
  }
  /** unbekanntes Feld überspringen */
  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 2) this.bytes();
    else if (wire === 5) this.pos += 4;
    else if (wire === 1) this.pos += 8;
    else throw new Error(`Protobuf: unbekannter Wire-Type ${wire}`);
  }
}

export type CanvasKind = "video" | "image" | "gif";
export type Canvas = { url: string; kind: CanvasKind; entityUri: string };

/** Canvaz.Type (Spotify): 0 Bild, 1/2/3 Video (Loop), 4 GIF */
function kindOf(type: number): CanvasKind {
  return type === 0 ? "image" : type === 4 ? "gif" : "video";
}

/**
 * Antwort: EntityCanvazResponse { repeated Canvaz canvases = 1 { string url = 2; Type type = 4; string entity_uri = 5 } }.
 * Unbekannte Felder werden übersprungen, damit Änderungen am Protokoll nicht alles brechen.
 */
export function decodeCanvasResponse(buf: Uint8Array): Canvas[] {
  const out: Canvas[] = [];
  const r = new Reader(buf);
  while (!r.done) {
    const tag = r.varint();
    const field = tag >>> 3;
    const wire = tag & 7;
    if (field === 1 && wire === 2) {
      const c = new Reader(r.bytes());
      let url = "";
      let entityUri = "";
      let type = 1;
      while (!c.done) {
        const t = c.varint();
        const f = t >>> 3;
        const w = t & 7;
        if (f === 2 && w === 2) url = Buffer.from(c.bytes()).toString("utf8");
        else if (f === 4 && w === 0) type = c.varint();
        else if (f === 5 && w === 2) entityUri = Buffer.from(c.bytes()).toString("utf8");
        else c.skip(w);
      }
      if (url) out.push({ url, kind: kindOf(type), entityUri });
    } else {
      r.skip(wire);
    }
  }
  return out;
}

// ---------------------------------------------------------------- Abruf

const CANVAS_ENDPOINT = "https://spclient.wg.spotify.com/canvaz-cache/v0/canvases";
/** Treffer dieser Instanz kurz merken (Canvas ändert sich selten; spart Anfragen) */
const MEMO_TTL_MS = 30 * 60_000;

export type CanvasConfig = WebTokenConfig;

/**
 * Canvas-Quelle: `get("<trackId>")` liefert das Canvas des Tracks (Video bevorzugt) oder `null`. Nutzt das
 * Web-Player-Token (sp_dc + TOTP) mit Circuit-Breaker; ohne Konfiguration oder während einer Pause gibt es `null`.
 */
export function createCanvas(cfg: CanvasConfig, fetchImpl: typeof fetch = fetch) {
  const now = cfg.now ?? Date.now;
  const web = createWebToken(cfg, fetchImpl);
  const memo = new Map<string, { value: Canvas | null; until: number }>();

  const fetchCanvas = async (trackId: string, signal: AbortSignal): Promise<Canvas | null> => {
    const body = encodeCanvasRequest([`spotify:track:${trackId}`]);
    const call = (token: string) =>
      fetchImpl(CANVAS_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/x-protobuf",
          Accept: "application/x-protobuf",
          "User-Agent": UA,
        },
        body: body as BodyInit,
        signal,
      });

    try {
      const hadCache = web.cachedToken();
      let res = await call(await web.token(signal));
      if (res.status === 401 && hadCache) {
        web.invalidate();
        res = await call(await web.token(signal));
      }
      if (res.status === 401 || res.status === 403) {
        web.trip(`Canvas verweigert das Token (HTTP ${res.status})`);
        return null;
      }
      if (res.status === 429) {
        web.trip("Spotify drosselt (Canvas 429)", retryAfterMs(res, now()));
        return null;
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Spotify-Canvas ${res.status}`);
      const buf = new Uint8Array(await res.arrayBuffer());
      const canvases = decodeCanvasResponse(buf);
      // Video bevorzugen, sonst das erste
      return canvases.find((c) => c.kind === "video") ?? canvases[0] ?? null;
    } catch (err) {
      if (err instanceof AuthCircuitError) return null; // Breaker ausgelöst / pausiert
      throw err; // Abbrüche und vorübergehende Netzwerkfehler weiterreichen
    }
  };

  return {
    status: (): ProviderStatus => web.status("spotify-canvas"),
    async get(trackId: string, signal: AbortSignal): Promise<Canvas | null> {
      if (!trackId || !web.configured || web.open()) return null;
      const hit = memo.get(trackId);
      if (hit && hit.until > now()) return hit.value;
      const value = await fetchCanvas(trackId, signal);
      // nur echte Antworten merken (nicht während einer frisch ausgelösten Pause)
      if (!web.open()) memo.set(trackId, { value, until: now() + MEMO_TTL_MS });
      return value;
    },
  };
}
