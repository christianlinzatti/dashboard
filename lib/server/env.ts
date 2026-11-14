/** Serverseitige Konfiguration – nie im Client importieren. */
export function serverEnv() {
  return {
    clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
    sessionSecret: process.env.SESSION_SECRET ?? "",
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
    allowedUsers: (process.env.ALLOWED_SPOTIFY_USERS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

export function isConfigured() {
  const e = serverEnv();
  return Boolean(e.clientId && e.clientSecret && e.sessionSecret.length >= 32);
}
