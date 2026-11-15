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
  "user-library-modify",
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

async function doRefresh(s: Session): Promise<Session> {
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: s.refreshToken });
  return {
    ...s,
    accessToken: t.access_token,
    expiresAt: Date.now() + t.expires_in * 1000,
    refreshToken: t.refresh_token ?? s.refreshToken, // bei PKCE rotiert Spotify Refresh-Tokens
    scope: t.scope || s.scope,
  };
}

/**
 * Single-Flight je Refresh-Token: Gleichzeitige Anfragen (z. B. now-playing + Player-Steuerung)
 * erneuern nur einmal. Da Spotify das Refresh-Token dabei austauschen kann, würde ein zweiter
 * Refresh mit dem alten Token sonst fehlschlagen. Das Ergebnis bleibt kurz abrufbar, damit auch
 * Anfragen mit noch altem Cookie die neuen Tokens bekommen.
 */
const refreshes = new Map<string, { promise: Promise<Session>; until: number }>();
const REUSE_MS = 60_000;

export function refreshSession(s: Session, refresh: (s: Session) => Promise<Session> = doRefresh): Promise<Session> {
  const now = Date.now();
  for (const [k, v] of refreshes) if (v.until < now) refreshes.delete(k);
  const hit = refreshes.get(s.refreshToken);
  if (hit) return hit.promise;
  const promise = refresh(s).catch((e) => {
    refreshes.delete(s.refreshToken);
    throw e;
  });
  refreshes.set(s.refreshToken, { promise, until: now + REUSE_MS });
  return promise;
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
export async function spotifyFetch(
  session: Session,
  path: string,
  init: RequestInit = {},
  deps: { fetch?: typeof fetch; refresh?: (s: Session) => Promise<Session> } = {},
) {
  const doFetch = deps.fetch ?? fetch;
  const renew = (x: Session) => refreshSession(x, deps.refresh);
  let s = session;
  let refreshed = false;
  if (Date.now() > s.expiresAt - 60_000) {
    s = await renew(s);
    refreshed = true;
  }
  const call = (token: string) =>
    doFetch(`${API}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, cache: "no-store" });
  let res = await call(s.accessToken);
  if (res.status === 401 && !refreshed) {
    s = await renew(s);
    refreshed = true;
    res = await call(s.accessToken);
  }
  return { res, session: s, refreshed };
}
