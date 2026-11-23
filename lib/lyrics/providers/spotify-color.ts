import { z } from "zod";
import {
  AuthCircuitError,
  createWebToken,
  retryAfterMs,
  totp,
  totpKey,
  UA,
  WEB_TOKEN_COOLDOWN_MS,
} from "@/lib/spotify/web-token";
import type { LyricsProvider } from "../types";

/**
 * Spotify Color-Lyrics (inoffiziell): Web-Player-Token über das sp_dc-Cookie (lib/spotify/web-token.ts). Bricht
 * erwartbar immer wieder, wenn Spotify das TOTP-Secret wechselt → gemeinsamer Circuit-Breaker.
 */

// weiterhin hier verfügbar (Tests, Abwärtskompatibilität)
export { totp, totpKey };
export const SPOTIFY_COLOR_COOLDOWN_MS = WEB_TOKEN_COOLDOWN_MS;

const lyricsSchema = z.object({
  lyrics: z.object({
    syncType: z.string(),
    lines: z.array(z.object({ startTimeMs: z.coerce.number(), words: z.string(), endTimeMs: z.coerce.number().optional() })),
  }),
});

/**
 * Reihenfolge: 1. Token der Dashboard-Anmeldung (falls Spotify es für Lyrics akzeptiert),
 * 2. Web-Player-Token über sp_dc (falls konfiguriert). Ohne beides: kein Ergebnis.
 *
 * Stabilität: Lehnt Spotify das Web-Player-Token ab oder drosselt, pausiert der gemeinsame Circuit-Breaker und der
 * Provider liefert solange `null` – die Suche fällt ohne Fehler auf die übrigen Provider zurück. Netzwerkfehler und
 * Abbrüche lösen keine Pause aus und werden weitergereicht.
 */
export function spotifyColor(
  cfg: {
    spDc?: string;
    totpSecret?: string;
    totpVersion?: string;
    cooldownMs?: number;
    onCircuitOpen?: (reason: string, pauseMs: number) => void;
    now?: () => number;
  },
  fetchImpl: typeof fetch = fetch,
): LyricsProvider {
  const now = cfg.now ?? Date.now;
  const web = createWebToken(cfg, fetchImpl);

  return {
    id: "spotify-color",
    priority: 25,
    status: () => web.status("spotify-color"),
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
        if (!web.configured || web.open()) return null;
        try {
          const hadCache = web.cachedToken();
          res = await lyricsFor(await web.token(signal));
          // abgelaufenes Token aus dem Cache: einmal mit frischem Token nachfragen, erst dann pausieren
          if (res.status === 401 && hadCache) {
            web.invalidate();
            res = await lyricsFor(await web.token(signal));
          }
          if (res.status === 401 || res.status === 403) web.trip(`Color-Lyrics verweigert das Token (HTTP ${res.status})`);
          else if (res.status === 429) web.trip("Spotify drosselt (Lyrics 429)", retryAfterMs(res, now()));
          if (res.status === 401 || res.status === 403 || res.status === 429) return null;
        } catch (err) {
          if (err instanceof AuthCircuitError) return null; // Breaker ausgelöst / pausiert → nächster Provider
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
