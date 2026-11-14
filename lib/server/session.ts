import { cookies } from "next/headers";
import { seal, unseal } from "./crypto";
import { serverEnv } from "./env";

export const SESSION_COOKIE = "ss_session";
export const OAUTH_COOKIE = "ss_oauth";

export type Session = {
  /** Spotify-User-ID */
  uid: string;
  name: string;
  accessToken: string;
  /** Ablauf des Access-Tokens (ms seit Epoch) */
  expiresAt: number;
  refreshToken: string;
  scope: string;
};

export type OAuthState = { state: string; verifier: string; redirectUri: string; createdAt: number };

const YEAR = 60 * 60 * 24 * 365;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  return unseal<Session>(jar.get(SESSION_COOKIE)?.value, serverEnv().sessionSecret);
}

export async function writeSession(session: Session) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, seal(session, serverEnv().sessionSecret), cookieOptions(YEAR));
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function writeOAuthState(s: OAuthState) {
  const jar = await cookies();
  jar.set(OAUTH_COOKIE, seal(s, serverEnv().sessionSecret), cookieOptions(600));
}

export async function takeOAuthState(): Promise<OAuthState | null> {
  const jar = await cookies();
  const s = unseal<OAuthState>(jar.get(OAUTH_COOKIE)?.value, serverEnv().sessionSecret);
  jar.delete(OAUTH_COOKIE);
  return s;
}
