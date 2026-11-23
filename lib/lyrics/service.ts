import "server-only";
import { CACHE_TTL } from "@/lib/cache-policy";
import { createHash } from "node:crypto";
import type { Lyrics } from "@/lib/song-context/schema";
import { createBreaker, type Breaker } from "./breaker";
import { getCache, type Cache } from "./cache";
import { findLyrics, toLyrics, type Attempt } from "./chain";
import { betterLyrics } from "./providers/better-lyrics";
import { localOverrides } from "./providers/local";
import { lrclib } from "./providers/lrclib";
import { musixmatchDesktop } from "./providers/musixmatch";
import { netease } from "./providers/netease";
import { spotifyColor } from "./providers/spotify-color";
import type { LyricsProvider, ProviderStatus, TrackQuery } from "./types";

const CACHE_VERSION = "v2";
export const DEFAULT_PROVIDERS = "better-lyrics,musixmatch-desktop,spotify-color,netease,lrclib";

/**
 * Externe Provider, steuerbar über LYRICS_PROVIDERS (kommagetrennt).
 * Spotify Color-Lyrics nutzt das Anmelde-Token und ggf. SPOTIFY_SP_DC + TOTP-Secret.
 */
export function activeProviders(env: Record<string, string | undefined> = process.env): LyricsProvider[] {
  const all: Record<string, () => LyricsProvider | null> = {
    "better-lyrics": () => betterLyrics({ apiKey: env.BETTER_LYRICS_API_KEY || undefined }),
    lrclib: () => lrclib(),
    netease: () => netease(),
    "musixmatch-desktop": () => musixmatchDesktop(),
    "spotify-color": () =>
      spotifyColor({
        spDc: env.SPOTIFY_SP_DC,
        totpSecret: env.SPOTIFY_TOTP_SECRET,
        totpVersion: env.SPOTIFY_TOTP_VERSION,
        // im Server-Log sichtbar: Secret/Version oder sp_dc erneuern
        onCircuitOpen: (reason, ms) => console.warn(`[lyrics] spotify-color pausiert ${Math.round(ms / 60_000)} min: ${reason}`),
      }),
  };
  const wanted = (env.LYRICS_PROVIDERS ?? DEFAULT_PROVIDERS).split(",").map((x) => x.trim());
  return wanted.flatMap((id) => {
    const p = all[id]?.();
    return p ? [p] : [];
  });
}

/** Kennung der Provider-Konfiguration (welche Provider, ob sp_dc gesetzt ist). */
export function providerConfig(providers: LyricsProvider[], spDcConfigured: boolean) {
  return createHash("sha1")
    .update(providers.map((p) => p.id).join(",") + (spDcConfigured ? "+spdc" : ""))
    .digest("hex")
    .slice(0, 8);
}

/**
 * Bisheriger Schlüssel (Provider-Konfiguration im Schlüssel). Wird nur noch gelesen, damit vorhandene Treffer
 * beim Umstieg erhalten bleiben.
 */
export function cacheKey(trackKey: string, providers: LyricsProvider[], spDcConfigured: boolean) {
  return `lyrics:${CACHE_VERSION}:${providerConfig(providers, spDcConfigured)}:${trackKey}`;
}

/**
 * Treffer unabhängig von der Provider-Konfiguration; „nicht gefunden“ dagegen pro Konfiguration –
 * kommt ein Provider hinzu, wird neu gesucht, vorhandene Texte bleiben aber erhalten.
 */
export const foundKey = (trackKey: string) => `lyrics:v3:found:${trackKey}`;
export const missKey = (trackKey: string, config: string) => `lyrics:v3:miss:${config}:${trackKey}`;

const QUALITY_RANK: Record<Lyrics["quality"], number> = { word: 4, "word-estimated": 3, line: 2, plain: 1 };
type Stored = Omit<LyricsResponse, "cached"> & { config?: string };

export type LyricsResponse = {
  lyrics: Lyrics | null;
  instrumental: boolean;
  cached: boolean;
  attempts: Attempt[];
};

type Deps = { providers: LyricsProvider[]; cache: Cache; local: LyricsProvider; breaker: Breaker; spDcConfigured: boolean };

export function createLyricsService(deps: Deps) {
  return async function lyricsFor(q: TrackQuery): Promise<LyricsResponse> {
    // Eigene Korrekturen zuerst und ohne Cache – Änderungen wirken sofort nach dem Deployment
    const local = await deps.local.search(q, AbortSignal.timeout(1000)).catch(() => null);
    if (local?.lines.length) {
      return {
        lyrics: toLyrics(local, q),
        instrumental: false,
        cached: false,
        attempts: [{ provider: "lokal", outcome: "ok", ms: 0 }],
      };
    }

    const config = providerConfig(deps.providers, deps.spDcConfigured);
    let hit = await deps.cache.get<Stored>(foundKey(q.trackKey));
    if (!hit) {
      // alter Schlüssel: vorhandenen Treffer übernehmen statt neu zu suchen
      const legacy = await deps.cache.get<Stored>(cacheKey(q.trackKey, deps.providers, deps.spDcConfigured));
      if (legacy?.lyrics) {
        hit = { ...legacy, config };
        await deps.cache.set(foundKey(q.trackKey), hit, CACHE_TTL.lyricsFound);
      } else if (legacy) return { ...legacy, cached: true };
    }
    // echter Wort-Sync ist das Beste, was es gibt; sonst nach einer Provider-Änderung einmal neu prüfen
    if (hit?.lyrics && (hit.lyrics.quality === "word" || hit.config === config)) return { ...withoutConfig(hit), cached: true };
    if (!hit) {
      const miss = await deps.cache.get<Stored>(missKey(q.trackKey, config));
      if (miss) return { ...miss, cached: true };
    }

    const r = await findLyrics(q, deps.providers, { breaker: deps.breaker });
    const value = { lyrics: r.lyrics, instrumental: r.instrumental, attempts: r.attempts };
    if (hit?.lyrics) {
      // nur ersetzen, wenn das neue Ergebnis besser ist; sonst alten Treffer mit neuer Konfiguration merken
      const better = r.lyrics && QUALITY_RANK[r.lyrics.quality] > QUALITY_RANK[hit.lyrics.quality];
      const keep: Stored = better ? { ...value, config } : { ...hit, config };
      await deps.cache.set(foundKey(q.trackKey), keep, CACHE_TTL.lyricsFound);
      return { ...withoutConfig(keep), cached: !better };
    }
    if (r.lyrics) {
      await deps.cache.set(foundKey(q.trackKey), { ...value, config }, CACHE_TTL.lyricsFound);
      return { ...value, cached: false };
    }
    // Fehler/Timeouts nicht cachen – nur echtes „nicht vorhanden“ (bzw. instrumental)
    const transient = r.attempts.some((a) => a.outcome === "error" || a.outcome === "timeout");
    if (!transient) await deps.cache.set(missKey(q.trackKey, config), value, CACHE_TTL.lyricsMissing);
    return { ...value, cached: false };
  };
}

function withoutConfig(s: Stored): Omit<LyricsResponse, "cached"> {
  return { lyrics: s.lyrics, instrumental: s.instrumental, attempts: s.attempts };
}

let shared: ReturnType<typeof createLyricsService> | undefined;
let sharedProviders: LyricsProvider[] = [];

/** Lyrics für einen Song (Standard-Instanz mit Umgebungs-Konfiguration). */
export function lyricsFor(q: TrackQuery) {
  if (!shared) {
    sharedProviders = activeProviders();
    shared = createLyricsService({
      providers: sharedProviders,
      cache: getCache(),
      local: localOverrides(),
      breaker: createBreaker(),
      spDcConfigured: !!process.env.SPOTIFY_SP_DC,
    });
  }
  return shared(q);
}

/**
 * Betriebszustand der Provider der Standard-Instanz (für /debug): welche pausieren gerade und warum. Nur Provider
 * mit einem Circuit-Breaker (z. B. Spotify Color-Lyrics) melden etwas.
 */
export function lyricsProviderStatus(): ProviderStatus[] {
  if (!shared) {
    sharedProviders = activeProviders();
  }
  return sharedProviders.flatMap((p) => (p.status ? [p.status()] : []));
}
