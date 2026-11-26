import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  });

  await context.addInitScript(() => {
    const origImportKey = crypto.subtle.importKey.bind(crypto.subtle);
    crypto.subtle.importKey = async (format, keyData, algorithm, extractable, keyUsages) => {
      if (format === "raw" && algorithm?.name === "HMAC") {
        window.__CAPTURED_TOTP_KEY__ = new TextDecoder().decode(keyData);
      }
      return origImportKey(format, keyData, algorithm, extractable, keyUsages);
    };
  });

  const page = await context.newPage();

  const tokenRequestPromise = page.waitForRequest((req) => req.url().includes("/api/token") && req.url().includes("totpVer="), {
    timeout: 20_000,
  });

  await page.goto("https://open.spotify.com/", { waitUntil: "domcontentloaded" });

  const req = await tokenRequestPromise;
  const url = new URL(req.url());
  const version = url.searchParams.get("totpVer");
  const secret = await page.evaluate(() => window.__CAPTURED_TOTP_KEY__ ?? null);

  await browser.close();

  if (!secret || !version) {
    console.error("Konnte TOTP-Parameter nicht extrahieren.");
    process.exit(1);
  }

  // Saubere JSON-Ausgabe für GitHub Actions
  process.stdout.write(JSON.stringify({ secret, version }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
