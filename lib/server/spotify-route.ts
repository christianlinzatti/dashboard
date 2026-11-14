import "server-only";
import { NextResponse } from "next/server";
import { isConfigured } from "./env";
import { readSession, writeSession, type Session } from "./session";
import { SpotifyError, spotifyFetch } from "@/lib/spotify/api";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Gemeinsamer Rahmen für Spotify-Routen: prüft Konfiguration und Anmeldung,
 * stellt einen API-Aufrufer bereit und speichert erneuerte Tokens im Cookie.
 */
export async function withSpotify(
  handler: (call: (path: string, init?: RequestInit) => Promise<Response>, session: Session) => Promise<Response>,
) {
  if (!isConfigured()) return json({ error: "Spotify ist auf dem Server nicht konfiguriert." }, 503);
  const initial = await readSession();
  if (!initial) return json({ error: "Nicht angemeldet." }, 401);

  let current = initial;
  let dirty = false;
  const call = async (path: string, init?: RequestInit) => {
    const r = await spotifyFetch(current, path, init);
    current = r.session;
    dirty ||= r.refreshed;
    return r.res;
  };

  try {
    const res = await handler(call, current);
    if (dirty) await writeSession(current);
    return res;
  } catch (e) {
    if (e instanceof SpotifyError && (e.status === 400 || e.status === 401)) {
      return json({ error: "Spotify-Anmeldung abgelaufen. Bitte neu verbinden." }, 401);
    }
    console.error("Spotify-Fehler", e);
    return json({ error: "Spotify ist gerade nicht erreichbar." }, 502);
  }
}
