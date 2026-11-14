import { z } from "zod";
import { isSameTrack } from "../match";
import { parseLrc } from "../parse-lrc";
import { cleanTitle } from "../text";
import type { LyricsProvider } from "../types";

const BASE = "https://apic-desktop.musixmatch.com/ws/1.1";
const APP = "web-desktop-app-v1.0";
const HEADERS = { Cookie: "AWSELB=0; AWSELBCORS=0" };

const message = z.object({ header: z.object({ status_code: z.number() }), body: z.unknown() });
const envelope = z.object({ message });

const trackSchema = z.object({
  track: z.object({
    track_name: z.string(),
    artist_name: z.string(),
    track_length: z.number().optional(),
    instrumental: z.number().optional(),
  }),
});
const subtitleSchema = z.object({
  subtitle_list: z.array(z.object({ subtitle: z.object({ subtitle_body: z.string() }) })).min(1),
});

let token: { value: string; until: number } | null = null;

/**
 * Musixmatch Desktop-API (inoffiziell, anonymer Token) über `macro.subtitles.get`.
 * Geprüft (Nov. 2026): liefert Zeilen-Sync als LRC; aus Rechenzentren kommen oft falsche
 * „Lockvogel“-Treffer – isSameTrack() verwirft diese, dann greifen die anderen Provider.
 */
export function musixmatchDesktop(fetchImpl: typeof fetch = fetch): LyricsProvider {
  const call = async (method: string, params: Record<string, string>, signal: AbortSignal) => {
    const qs = new URLSearchParams({ format: "json", app_id: APP, ...params });
    const res = await fetchImpl(`${BASE}/${method}?${qs}`, { headers: HEADERS, signal });
    if (!res.ok) throw new Error(`Musixmatch ${res.status}`);
    return envelope.parse(await res.json()).message;
  };
  const userToken = async (signal: AbortSignal) => {
    if (token && token.until > Date.now()) return token.value;
    const m = await call("token.get", { user_language: "de", t: String(Date.now()) }, signal);
    const value = z.object({ user_token: z.string() }).parse(m.body).user_token;
    if (value.startsWith("UpgradeOnly")) throw new Error("Musixmatch: Token gesperrt");
    token = { value, until: Date.now() + 6 * 3600_000 };
    return value;
  };

  return {
    id: "musixmatch-desktop",
    priority: 20,
    async search(q, signal) {
      const m = await call(
        "macro.subtitles.get",
        {
          namespace: "lyrics_synched",
          subtitle_format: "lrc",
          q_track: cleanTitle(q.title),
          q_artist: q.artists[0] ?? "",
          q_duration: String(Math.round(q.durationMs / 1000)),
          ...(q.album ? { q_album: q.album } : {}),
          ...(q.spotifyId ? { track_spotify_id: `spotify:track:${q.spotifyId}` } : {}),
          usertoken: await userToken(signal),
        },
        signal,
      );
      if (m.header.status_code === 401) {
        token = null; // beim nächsten Mal neuer Token
        throw new Error("Musixmatch: Token abgelehnt");
      }
      const calls = z.object({ macro_calls: z.record(z.string(), z.object({ message })) }).safeParse(m.body);
      if (!calls.success) return null;
      const t = trackSchema.safeParse(calls.data.macro_calls["matcher.track.get"]?.message.body);
      if (!t.success) return null;
      const tr = t.data.track;
      const durationMs = tr.track_length ? tr.track_length * 1000 : undefined;
      if (!isSameTrack(q, { title: tr.track_name, artists: [tr.artist_name], durationMs })) return null;
      if (tr.instrumental) return { provider: "musixmatch", sync: "plain", lines: [], instrumental: true, durationMs };

      const sub = subtitleSchema.safeParse(calls.data.macro_calls["track.subtitles.get"]?.message.body);
      if (!sub.success) return null;
      const { lines } = parseLrc(sub.data.subtitle_list[0]!.subtitle.subtitle_body, q.durationMs);
      return lines.length ? { provider: "musixmatch", sync: "line", lines, durationMs } : null;
    },
  };
}
