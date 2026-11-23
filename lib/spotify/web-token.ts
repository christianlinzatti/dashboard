import { createHmac } from "node:crypto";
import { z } from "zod";
import type { ProviderStatus } from "@/lib/lyrics/types";

/**
 * Web-Player-Token über das sp_dc-Cookie (inoffiziell). Spotify verlangt dafür ein TOTP, dessen Geheimnis es
 * regelmäßig wechselt (SPOTIFY_TOTP_SECRET/-VERSION, von Hand gepflegt). Das Token öffnet dieselben internen
 * Endpunkte, die der Web-Player nutzt (Color-Lyrics, Canvas). Lehnt Spotify ab oder drosselt, pausiert ein
 * Circuit-Breaker: Aufrufer bekommen `null`/kein Ergebnis, Spotify wird nicht bei jedem Song erneut gefragt.
 *
 * Bewusst nicht enthalten: automatische Beschaffung oder Rotation des Secrets. Bricht das Token, muss das Secret
 * von Hand erneuert werden – der Status (siehe `status()`) zeigt es unter /debug an.
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

export const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

/** Ablehnung, die sich durch Wiederholen nicht bessert (TOTP/sp_dc ungültig, Konfiguration kaputt) – oder Drosselung */
export class AuthCircuitError extends Error {
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
export const WEB_TOKEN_COOLDOWN_MS = 15 * 60_000;
/** Mindestpause bei Drosselung (HTTP 429), falls Spotify kein Retry-After schickt */
const RATE_LIMIT_MIN_MS = 60_000;

/** Retry-After (Sekunden oder HTTP-Datum) → ms; mindestens RATE_LIMIT_MIN_MS */
export function retryAfterMs(res: Response, now: number): number {
  const v = res.headers.get("retry-after");
  const secs = v ? Number(v) : NaN;
  const ms = Number.isFinite(secs) ? secs * 1000 : v ? Date.parse(v) - now : NaN;
  return Math.max(RATE_LIMIT_MIN_MS, Number.isFinite(ms) ? ms : 0);
}

export type WebTokenConfig = {
  spDc?: string;
  totpSecret?: string;
  totpVersion?: string;
  /** Pause nach einer Ablehnung (Standard 15 min) */
  cooldownMs?: number;
  /** Meldung, wenn der Breaker auslöst (Protokoll) */
  onCircuitOpen?: (reason: string, pauseMs: number) => void;
  /** Uhr (Tests) */
  now?: () => number;
};

export type WebToken = ReturnType<typeof createWebToken>;

/**
 * Gemeinsame Token-Quelle für die internen Spotify-Endpunkte. `token()` liefert ein gültiges Web-Player-Token oder
 * wirft `AuthCircuitError` (bei offener Pause mit Meldung „pausiert“, sonst mit Grund – dann ist der Breaker bereits
 * ausgelöst). Aufrufer klassifizieren die Antwort ihres Endpunkts selbst und lösen bei dessen Ablehnung `trip()` aus.
 */
export function createWebToken(cfg: WebTokenConfig, fetchImpl: typeof fetch = fetch) {
  const now = cfg.now ?? Date.now;
  const cooldownMs = cfg.cooldownMs ?? WEB_TOKEN_COOLDOWN_MS;
  let cached: { token: string; until: number } | null = null;
  let pending: Promise<string> | null = null;
  let circuitOpenUntil = 0;
  let lastReason: string | undefined;

  const trip = (reason: string, pauseMs = cooldownMs) => {
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

  return {
    configured: !!(cfg.spDc && cfg.totpSecret),
    open: () => now() < circuitOpenUntil,
    /** ob gerade ein (nicht abgelaufenes) Token im Speicher liegt – für „einmal frisch holen“ */
    cachedToken: () => !!cached,
    invalidate: () => {
      cached = null;
    },
    trip,
    /** löst bei Token-Ablehnung selbst den Breaker aus; wirft bei offener Pause „pausiert“ */
    token(signal: AbortSignal): Promise<string> {
      if (now() < circuitOpenUntil) return Promise.reject(new AuthCircuitError("pausiert"));
      if (cached && cached.until > now() + 30_000) return Promise.resolve(cached.token);
      pending ??= fetchToken(signal)
        .catch((err) => {
          if (err instanceof AuthCircuitError && err.message !== "pausiert") trip(err.message, err.pauseMs);
          throw err;
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
    status: (id: string): ProviderStatus => ({
      id,
      configured: !!(cfg.spDc && cfg.totpSecret),
      paused: now() < circuitOpenUntil,
      ...(circuitOpenUntil > now() ? { pausedUntil: circuitOpenUntil } : {}),
      ...(lastReason ? { reason: lastReason } : {}),
    }),
  };
}
