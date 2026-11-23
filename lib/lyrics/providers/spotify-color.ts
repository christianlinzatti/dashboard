import { createHmac } from "node:crypto";
import { z } from "zod";
import type { LyricsProvider, ProviderStatus } from "../types";

/**
 * Spotify Color-Lyrics (inoffiziell, Ansatz wie simonroedig/SpotifyLyrics): Web-Player-Token über das
 * sp_dc-Cookie. Spotify verlangt dafür inzwischen ein TOTP; das Geheimnis ändert Spotify regelmäßig
 * (SPOTIFY_TOTP_SECRET/-VERSION, aus der Community). Bricht erwartbar immer wieder → Circuit-Breaker.
 */

/** TOTP-Schlüssel: Spotify-„Secret“ (Zahlenfolge) → XOR-Transformation → Dezimal-String als Schlüssel. */
export function totpKey(secret: string): Buffer {
  const trimmed = secret.trim();
  if (trimmed.startsWith("[")) {
    const nums = z.array(z.number()).parse(JSON.parse(trimmed));
    return Buffer.from(nums.map((n, i) => n ^ ((i % 33) + 9)).join(""), "utf8");
  }
  return Buffer.from(trimmed, "utf8");
}

/** RFC 6238: HMAC-SHA1, 30-s-Schritte, 6 Stellen. */
export function totp(key: Buffer, unixSeconds: number, step = 30, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(unixSeconds / step)));
  const h = createHmac("sha1", key).update(counter).digest();
  const off = h[h.length - 1]! & 0x0f;
  const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

const tokenSchema = z.object({
  accessToken: z.string(),
  accessTokenExpirationTimestampMs: z.number(),
  isAnonymous: z.boolean().optional(),
});
const lyricsSchema = z.object({
  lyrics: z.object({
    syncType: z.string(),
    lines: z.array(z.object({ startTimeMs: z.coerce.number(), words: z.string(), endTimeMs: z.coerce.number().optional() })),
  }),
});

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/** Ablehnung, die sich durch Wiederholen nicht bessert (TOTP/sp_dc ungültig, Konfiguration kaputt) – oder Drosselung */
class AuthCircuitError extends Error {
  constructor(
    message: string,
    /** so lange pausieren (ms); ohne Angabe die Standard-Pause */
    readonly pauseMs?: number,
  ) {
    super(message);
    this.name = "AuthCircuitError";
  }
}

/** Standard-Pause nach einer Ablehnung (TOTP-Wechsel, sp_dc abgelaufen) */
export const SPOTIFY_COLOR_COOLDOWN_MS = 15 * 60_000;
/** Mindestpause bei Drosselung (HTTP 429), falls Spotify kein Retry-After schickt */
const RATE_LIMIT_MIN_MS = 60_000;

/** Retry-After (Sekunden oder HTTP-Datum) → ms; mindestens RATE_LIMIT_MIN_MS */
function retryAfterMs(res: Response, now: number): number {
  const v = res.headers.get("retry-after");
  const secs = v ? Number(v) : NaN;
  const ms = Number.isFinite(secs) ? secs * 1000 : v ? Date.parse(v) - now : NaN;
  return Math.max(RATE_LIMIT_MIN_MS, Number.isFinite(ms) ? ms : 0);
}

/**
 * Reihenfolge: 1. Token der Dashboard-Anmeldung (falls Spotify es für Lyrics akzeptiert),
 * 2. Web-Player-Token über sp_dc (falls konfiguriert). Ohne beides: kein Ergebnis.
 *
 * Stabilität: Lehnt Spotify das Web-Player-Token ab (TOTP gewechselt, sp_dc abgelaufen, anonymes Token) oder drosselt
 * (429), pausiert der Provider (Circuit-Breaker) und liefert solange `null` – die Suche fällt ohne Fehler auf die
 * übrigen Provider zurück, und Spotify wird nicht bei jedem Song erneut angefragt. Netzwerkfehler und Abbrüche
 * lösen keine Pause aus (sie sind vorübergehend) und werden wie bisher weitergereicht.
 */
export function spotifyColor(
  cfg: {
    spDc?: string;
    totpSecret?: string;
    totpVersion?: string;
    /** Pause nach einer Ablehnung (Standard 15 min) */
    cooldownMs?: number;
    /** Meldung, wenn der Provider pausiert (Protokoll) */
    onCircuitOpen?: (reason: string, pauseMs: number) => void;
    /** Uhr (Tests) */
    now?: () => number;
  },
  fetchImpl: typeof fetch = fetch,
): LyricsProvider {
  const now = cfg.now ?? Date.now;
  const cooldownMs = cfg.cooldownMs ?? SPOTIFY_COLOR_COOLDOWN_MS;
  let cached: { token: string; until: number } | null = null;
  /** laufende Token-Anfrage – gleichzeitige Suchen teilen sie */
  let pending: Promise<string> | null = null;
  let circuitOpenUntil = 0;
  let lastReason: string | undefined;

  const tripCircuit = (reason: string, pauseMs = cooldownMs) => {
    cached = null;
    circuitOpenUntil = now() + pauseMs;
    lastReason = reason;
    cfg.onCircuitOpen?.(reason, pauseMs);
  };

  const fetchToken = async (signal: AbortSignal): Promise<string> => {
    let key: Buffer;
    try {
      key = totpKey(cfg.totpSecret!);
    } catch {
      throw new AuthCircuitError("SPOTIFY_TOTP_SECRET ist kein gültiges Secret");
    }
    const st = await fetchImpl("https://open.spotify.com/api/server-time", { headers: { "User-Agent": UA }, signal });
    if (st.status === 429) throw new AuthCircuitError("Spotify drosselt (server-time 429)", retryAfterMs(st, now()));
    if (!st.ok) throw new Error(`Spotify server-time ${st.status}`);
    const rawTime = z.object({ serverTime: z.number() }).parse(await st.json()).serverTime;
    // manche Antworten liefern Millisekunden statt Sekunden
    const serverSeconds = rawTime > 1e11 ? Math.floor(rawTime / 1000) : rawTime;
    const code = totp(key, serverSeconds);
    const qs = new URLSearchParams({
      reason: "init",
      productType: "web-player",
      totp: code,
      totpServer: code,
      totpVer: cfg.totpVersion ?? "1",
    });
    const res = await fetchImpl(`https://open.spotify.com/api/token?${qs}`, {
      headers: { Cookie: `sp_dc=${cfg.spDc}`, "User-Agent": UA },
      signal,
    });
    if (res.status === 429) throw new AuthCircuitError("Spotify drosselt (Token 429)", retryAfterMs(res, now()));
    if (res.status === 400 || res.status === 401 || res.status === 403)
      throw new AuthCircuitError(`TOTP oder sp_dc abgelehnt (HTTP ${res.status})`);
    if (!res.ok) throw new Error(`Spotify-Token ${res.status}`);
    const t = tokenSchema.parse(await res.json());
    if (t.isAnonymous) throw new AuthCircuitError("Anonymes Token erhalten – sp_dc abgelaufen oder TOTP ungültig");
    cached = { token: t.accessToken, until: t.accessTokenExpirationTimestampMs };
    return t.accessToken;
  };

  const accessToken = (signal: AbortSignal): Promise<string> => {
    if (now() < circuitOpenUntil) return Promise.reject(new AuthCircuitError("pausiert"));
    if (cached && cached.until > now() + 30_000) return Promise.resolve(cached.token);
    pending ??= fetchToken(signal).finally(() => {
      pending = null;
    });
    return pending;
  };

  const status = (): ProviderStatus => ({
    id: "spotify-color",
    configured: !!(cfg.spDc && cfg.totpSecret),
    paused: now() < circuitOpenUntil,
    ...(circuitOpenUntil > now() ? { pausedUntil: circuitOpenUntil } : {}),
    ...(lastReason ? { reason: lastReason } : {}),
  });

  return {
    id: "spotify-color",
    priority: 25,
    status,
    async search(q, signal) {
      if (!q.spotifyId || q.spotifyId.startsWith("local:")) return null;
      const lyricsFor = (token: string) =>
        fetchImpl(
          `https://spclient.wg.spotify.com/color-lyrics/v2/track/${encodeURIComponent(q.spotifyId!)}?format=json&vocalRemoval=false&market=from_token`,
          { headers: { Authorization: `Bearer ${token}`, "app-platform": "WebPlayer", "User-Agent": UA }, signal },
        );

      let res: Response | null = null;
      // 1. Token der Anmeldung: Ablehnung ist erwartbar und löst keine Pause aus
      if (q.userAccessToken) {
        res = await lyricsFor(q.userAccessToken);
        if (res.status === 401 || res.status === 403) res = null;
      }
      // 2. Web-Player-Token über sp_dc + TOTP (mit Circuit-Breaker)
      if (!res) {
        if (!cfg.spDc || !cfg.totpSecret || now() < circuitOpenUntil) return null;
        try {
          const hadCache = !!cached;
          res = await lyricsFor(await accessToken(signal));
          // abgelaufenes Token aus dem Cache: einmal mit frischem Token nachfragen, erst dann pausieren
          if (res.status === 401 && hadCache) {
            cached = null;
            res = await lyricsFor(await accessToken(signal));
          }
          if (res.status === 401 || res.status === 403)
            throw new AuthCircuitError(`Color-Lyrics verweigert das Token (HTTP ${res.status})`);
          if (res.status === 429) throw new AuthCircuitError("Spotify drosselt (Lyrics 429)", retryAfterMs(res, now()));
        } catch (err) {
          if (err instanceof AuthCircuitError) {
            if (err.message !== "pausiert") tripCircuit(err.message, err.pauseMs);
            return null; // weiter mit den übrigen Providern
          }
          throw err; // Abbrüche und vorübergehende Netzwerkfehler wie bisher (keine Pause)
        }
      }

      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Spotify-Lyrics ${res.status}`);
      const body = lyricsSchema.parse(await res.json());
      const all = [...body.lyrics.lines].sort((a, b) => a.startTimeMs - b.startTimeMs);
      const raw = all.filter((l) => l.words.trim() && l.words.trim() !== "♪");
      if (!raw.length) return null;
      if (body.lyrics.syncType === "UNSYNCED") {
        return { provider: "spotify", sync: "plain", lines: raw.map((l) => ({ startMs: 0, endMs: 0, text: l.words.trim() })) };
      }
      const lines = raw.map((l) => {
        // Ende: eigene Angabe, sonst Beginn der nächsten Zeile (auch einer „♪“-Pause), sonst 4 s
        const next = all.find((n) => n.startTimeMs > l.startTimeMs);
        const end = l.endTimeMs && l.endTimeMs > l.startTimeMs ? l.endTimeMs : (next?.startTimeMs ?? l.startTimeMs + 4000);
        return { startMs: l.startTimeMs, endMs: Math.max(end, l.startTimeMs + 200), text: l.words.trim() };
      });
      return { provider: "spotify", sync: "line", lines };
    },
  };
}
