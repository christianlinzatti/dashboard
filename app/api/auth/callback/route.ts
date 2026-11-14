import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode } from "@/lib/spotify/api";
import { serverEnv } from "@/lib/server/env";
import { takeOAuthState, writeSession } from "@/lib/server/session";

function back(req: NextRequest, error?: string) {
  const url = new URL("/", req.nextUrl.origin);
  if (error) url.searchParams.set("fehler", error);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const saved = await takeOAuthState();

  if (req.nextUrl.searchParams.get("error")) return back(req, "abgebrochen");
  if (!code || !state || !saved || saved.state !== state || Date.now() - saved.createdAt > 10 * 60_000) {
    return back(req, "ungueltig");
  }

  try {
    const t = await exchangeCode(code, saved.verifier, saved.redirectUri);
    const me = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${t.access_token}` },
      cache: "no-store",
    });
    if (!me.ok) return back(req, "profil");
    const profile = (await me.json()) as { id: string; display_name?: string | null };

    const allowed = serverEnv().allowedUsers;
    if (allowed.length && !allowed.includes(profile.id)) return back(req, "nicht-freigegeben");

    await writeSession({
      uid: profile.id,
      name: profile.display_name ?? profile.id,
      accessToken: t.access_token,
      expiresAt: Date.now() + t.expires_in * 1000,
      refreshToken: t.refresh_token ?? "",
      scope: t.scope,
    });
    return back(req);
  } catch (e) {
    console.error("Spotify-Anmeldung fehlgeschlagen", e);
    return back(req, "token");
  }
}
