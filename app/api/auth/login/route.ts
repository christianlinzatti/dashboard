import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl } from "@/lib/spotify/api";
import { pkcePair, randomState } from "@/lib/server/crypto";
import { isConfigured, serverEnv } from "@/lib/server/env";
import { writeOAuthState } from "@/lib/server/session";

export async function GET(req: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ error: "Spotify ist auf dem Server nicht konfiguriert." }, { status: 503 });
  }
  const redirectUri = serverEnv().redirectUri ?? `${req.nextUrl.origin}/api/auth/callback`;
  const { verifier, challenge } = pkcePair();
  const state = randomState();
  await writeOAuthState({ state, verifier, redirectUri, createdAt: Date.now() });
  return NextResponse.redirect(authorizeUrl({ state, challenge, redirectUri }));
}
