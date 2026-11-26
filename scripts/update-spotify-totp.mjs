// scripts/update-spotify-totp.mjs
const SECRETS_URL =
  process.env.SPOTIFY_SECRETS_URL ??
  "https://raw.githubusercontent.com/Thereallo1026/spotify-secrets/main/secrets/secretDict.json";

async function main() {
  const res = await fetch(SECRETS_URL);
  if (!res.ok) {
    throw new Error(`Konnte Community-Secrets nicht laden: HTTP ${res.status}`);
  }

  const dict = await res.json();
  const versions = Object.keys(dict)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);

  const latestVersion = versions[0];
  if (!latestVersion || !Array.isArray(dict[String(latestVersion)])) {
    throw new Error("Kein gültiges Secret-Array im JSON gefunden.");
  }

  process.stdout.write(
    JSON.stringify({
      secret: JSON.stringify(dict[String(latestVersion)]),
      version: String(latestVersion),
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
