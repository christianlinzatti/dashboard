import "server-only";
import { serverEnv } from "@/lib/server/env";
import type { Session } from "@/lib/server/session";

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";

export const SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-read-recently-played",
  "user-library-read",
  "user-follow-read",
  "user-modify-playback-state",
].join(" ");

export function authorizeUrl(p: { state: string; challenge: string; redirectUri: string }) {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: serverEnv().clientId,
    scope: SCOPES,
    redirect_uri: p.redirectUri,
    state: p.state,
    code_challenge_method: "S256",
    code_challenge: p.challenge,
  });
  return `${ACCOUNTS}/authorize?${q}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { clientId, clientSecret } = serverEnv();
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  if (!res.ok) throw new SpotifyError(res.status, `Token-Anfrage fehlgeschlagen (${res.status})`);
  return res.json();
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier });
}

export async function refreshSession(s: Session): Promise<Session> {
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refreshToken });
  return {
    ...s,
    accessToken: t.access_token,
    expiresAt: Date.now() + t.expires_in * 1000,
    refreshToken: t.refresh_token ?? s.refreshToken, // Spotify rotiert Refresh-Tokens teilweise
    scope: t.scope || s.scope,
  };
}

export class SpotifyError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Aufruf der Spotify-Web-API; erneuert das Access-Token bei Bedarf.
 * Gibt die (ggf. aktualisierte) Session zurück, damit der Aufrufer das Cookie neu schreiben kann.
 */
export async function spotifyFetch(session: Session, path: string, init: RequestInit = {}) {
  let s = session;
  let refreshed = false;
  if (Date.now() > s.expiresAt - 60_000) {
    s = await refreshSession(s);
    refreshed = true;
  }
  const call = (token: string) =>
    fetch(`${API}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, cache: "no-store" });
  let res = await call(s.accessToken);
  if (res.status === 401 && !refreshed) {
    s = await refreshSession(s);
    refreshed = true;
    res = await call(s.accessToken);
  }
  return { res, session: s, refreshed };
}
