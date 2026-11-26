// scripts/update-spotify-totp.mjs
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const JSON_SOURCES = [
  process.env.SPOTIFY_SECRETS_URL,
  "https://raw.githubusercontent.com/xyloflake/spot-secrets-go/refs/heads/main/secrets/secretDict.json",
  "https://raw.githubusercontent.com/Thereallo1026/spotify-secrets/main/secrets/secretDict.json",
].filter(Boolean);

/**
 * Hilfsfunktion: Extrahiert aus einem Dictionary { "60": [...], "61": [...] }
 * die höchste Versionsnummer und das zugehörige Byte-Array.
 */
function pickHighestVersion(dict) {
  if (!dict || typeof dict !== "object") return null;

  const latestVersion = Object.keys(dict)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .sort((a, b) => b - a)[0];

  if (latestVersion === undefined) return null;

  const bytes = dict[String(latestVersion)];
  if (!Array.isArray(bytes) || bytes.length < 10 || !bytes.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return null;
  }

  return {
    secret: JSON.stringify(bytes),
    version: String(latestVersion),
  };
}

/**
 * Stufe 1: Schneller Abruf aus den Community-JSON-Feeds
 */
async function fetchFromJsonFeeds() {
  for (const url of JSON_SOURCES) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;

      const dict = await res.json();
      const picked = pickHighestVersion(dict);
      if (picked) {
        return picked;
      }
    } catch {
      // Nächste Quelle probieren
    }
  }
  return null;
}

/**
 * Stufe 2 (Fallback): Direkte Extraktion aus den Spotify Web-Player JS-Bundles
 */
async function extractFromWebPlayerBundles() {
  const htmlRes = await fetch("https://open.spotify.com/", {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!htmlRes.ok) {
    throw new Error(`open.spotify.com antwortete mit HTTP ${htmlRes.status}`);
  }

  const html = await htmlRes.text();
  const scriptRegex = /<script[^>]+src=["']([^"']+\.js(?:\?[^"']*)?)["']/gi;
  const scriptUrls = new Set();

  for (const match of html.matchAll(scriptRegex)) {
    const src = match[1];
    if (!src) continue;
    const fullUrl = src.startsWith("http") ? src : new URL(src, "https://open.spotify.com/").toString();
    if (fullUrl.includes("scdn.co") || fullUrl.includes("spotify.com")) {
      scriptUrls.add(fullUrl);
    }
  }

  if (!scriptUrls.size) {
    throw new Error("Keine Web-Player JS-Bundles im HTML gefunden.");
  }

  const candidateDict = {};
  const mapEntryRegex = /["']?(\d{2,3})["']?\s*:\s*\[(\s*\d{1,3}(?:\s*,\s*\d{1,3}){15,}\s*)\]/g;

  await Promise.all(
    [...scriptUrls].map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return;

        const js = await res.text();
        if (!js.includes("totp") && !js.includes("33")) return;

        for (const match of js.matchAll(mapEntryRegex)) {
          const ver = match[1];
          const rawNums = match[2];
          if (!ver || !rawNums) continue;

          const nums = rawNums.split(",").map((s) => Number(s.trim()));
          if (nums.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
            candidateDict[ver] = nums;
          }
        }
      } catch {
        // Einzelne Chunk-Fehler überspringen
      }
    }),
  );

  const picked = pickHighestVersion(candidateDict);
  if (!picked) {
    throw new Error("Fallback-Bundle-Scan konnte kein gültiges TOTP-Secret extrahieren.");
  }

  return picked;
}

async function main() {
  const result = (await fetchFromJsonFeeds()) ?? (await extractFromWebPlayerBundles());
  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
