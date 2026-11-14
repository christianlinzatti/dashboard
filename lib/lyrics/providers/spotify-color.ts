import { createHmac } from "node:crypto";
import { z } from "zod";
import type { LyricsProvider } from "../types";

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

/**
 * Reihenfolge: 1. Token der Dashboard-Anmeldung (falls Spotify es für Lyrics akzeptiert),
 * 2. Web-Player-Token über sp_dc (falls konfiguriert). Ohne beides: kein Ergebnis.
 */
export function spotifyColor(
  cfg: { spDc?: string; totpSecret?: string; totpVersion?: string },
  fetchImpl: typeof fetch = fetch,
): LyricsProvider {
  let cached: { token: string; until: number } | null = null;

  const accessToken = async (signal: AbortSignal) => {
    if (cached && cached.until > Date.now() + 30_000) return cached.token;
    const st = await fetchImpl("https://open.spotify.com/api/server-time", { headers: { "User-Agent": UA }, signal });
    const serverTime = z.object({ serverTime: z.number() }).parse(await st.json()).serverTime;
    const code = totp(totpKey(cfg.totpSecret!), serverTime);
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
    if (!res.ok) throw new Error(`Spotify-Token ${res.status}`);
    const t = tokenSchema.parse(await res.json());
    if (t.isAnonymous) throw new Error("Spotify: sp_dc ungültig oder abgelaufen");
    cached = { token: t.accessToken, until: t.accessTokenExpirationTimestampMs };
    return t.accessToken;
  };

  return {
    id: "spotify-color",
    priority: 25,
    async search(q, signal) {
      if (!q.spotifyId || q.spotifyId.startsWith("local:")) return null;
      const lyricsFor = (token: string) =>
        fetchImpl(
          `https://spclient.wg.spotify.com/color-lyrics/v2/track/${encodeURIComponent(q.spotifyId!)}?format=json&vocalRemoval=false&market=from_token`,
          { headers: { Authorization: `Bearer ${token}`, "app-platform": "WebPlayer", "User-Agent": UA }, signal },
        );

      let res: Response | null = null;
      if (q.userAccessToken) {
        res = await lyricsFor(q.userAccessToken);
        if (res.status === 401 || res.status === 403) res = null; // Spotify akzeptiert App-Tokens nicht → sp_dc
      }
      if (!res) {
        if (!cfg.spDc || !cfg.totpSecret) return null;
        res = await lyricsFor(await accessToken(signal));
      }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Spotify-Lyrics ${res.status}`);
      const body = lyricsSchema.parse(await res.json());
      const raw = body.lyrics.lines.filter((l) => l.words.trim() && l.words.trim() !== "♪");
      if (!raw.length) return null;
      if (body.lyrics.syncType === "UNSYNCED") {
        return { provider: "spotify", sync: "plain", lines: raw.map((l) => ({ startMs: 0, endMs: 0, text: l.words })) };
      }
      const lines = raw.map((l) => {
        const next = body.lyrics.lines.find((n) => n.startTimeMs > l.startTimeMs);
        const end = l.endTimeMs && l.endTimeMs > l.startTimeMs ? l.endTimeMs : (next?.startTimeMs ?? l.startTimeMs + 4000);
        return { startMs: l.startTimeMs, endMs: Math.max(end, l.startTimeMs + 200), text: l.words.trim() };
      });
      return { provider: "spotify", sync: "line", lines };
    },
  };
}
